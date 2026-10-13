#include "whisper.h"

#include <SDL.h>

#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <mutex>
#include <string>
#include <thread>
#include <vector>

namespace {

constexpr int kSampleRate = WHISPER_SAMPLE_RATE;
constexpr int kMaxAudioMs = 30000;

struct Options {
    std::string model;
    std::string language = "en";
    int capture_id = -1;
    int partial_ms = 750;
    int min_audio_ms = 500;
    int threads = std::max(1, std::min(8, static_cast<int>(std::thread::hardware_concurrency())));
};

std::string json_escape(const std::string & value) {
    std::string result;
    result.reserve(value.size() + 16);
    for (const unsigned char ch : value) {
        switch (ch) {
            case '\\': result += "\\\\"; break;
            case '"': result += "\\\""; break;
            case '\n': result += "\\n"; break;
            case '\r': result += "\\r"; break;
            case '\t': result += "\\t"; break;
            default:
                if (ch >= 0x20) result += static_cast<char>(ch);
                break;
        }
    }
    return result;
}

void emit(const std::string & value) {
    std::cout << value << '\n' << std::flush;
}

void emit_error(const std::string & code) {
    emit("{\"event\":\"error\",\"code\":\"" + json_escape(code) + "\"}");
}

bool parse_int(const char * value, int & output) {
    if (!value) return false;
    char * end = nullptr;
    const long parsed = std::strtol(value, &end, 10);
    if (!end || *end != '\0' || parsed < -1 || parsed > 60000) return false;
    output = static_cast<int>(parsed);
    return true;
}

bool parse_options(int argc, char ** argv, Options & options) {
    for (int i = 1; i < argc; ++i) {
        const std::string arg = argv[i];
        auto next = [&]() -> const char * { return ++i < argc ? argv[i] : nullptr; };
        if (arg == "--model") {
            const char * value = next();
            if (!value) return false;
            options.model = value;
        } else if (arg == "--language") {
            const char * value = next();
            if (!value) return false;
            options.language = value;
        } else if (arg == "--capture-id") {
            if (!parse_int(next(), options.capture_id)) return false;
        } else if (arg == "--partial-ms") {
            if (!parse_int(next(), options.partial_ms)) return false;
        } else if (arg == "--threads") {
            if (!parse_int(next(), options.threads)) return false;
        } else {
            return false;
        }
    }
    return !options.model.empty() && options.partial_ms >= 250 && options.threads >= 1;
}

class AudioCapture {
public:
    ~AudioCapture() {
        if (device_) SDL_CloseAudioDevice(device_);
        SDL_QuitSubSystem(SDL_INIT_AUDIO);
    }

    bool start(int capture_id) {
        if (SDL_Init(SDL_INIT_AUDIO) != 0) {
            std::cerr << "SDL audio initialization failed: " << SDL_GetError() << '\n';
            return false;
        }
        SDL_SetHintWithPriority(SDL_HINT_AUDIO_RESAMPLING_MODE, "medium", SDL_HINT_OVERRIDE);

        const int count = SDL_GetNumAudioDevices(SDL_TRUE);
        std::cerr << "SDL capture devices: " << count << '\n';
        for (int i = 0; i < count; ++i) {
            const char * name = SDL_GetAudioDeviceName(i, SDL_TRUE);
            std::cerr << "SDL capture device " << i << ": " << (name ? name : "<unknown>") << '\n';
        }

        SDL_AudioSpec requested{};
        requested.freq = kSampleRate;
        requested.format = AUDIO_F32SYS;
        requested.channels = 1;
        requested.samples = 1024;
        requested.callback = &AudioCapture::callback;
        requested.userdata = this;

        const char * device_name = nullptr;
        if (capture_id >= 0) {
            if (capture_id >= count) {
                std::cerr << "SDL capture device id is unavailable: " << capture_id << '\n';
                return false;
            }
            device_name = SDL_GetAudioDeviceName(capture_id, SDL_TRUE);
        }

        SDL_AudioSpec obtained{};
        device_ = SDL_OpenAudioDevice(device_name, SDL_TRUE, &requested, &obtained, 0);
        if (!device_) {
            std::cerr << "SDL capture open failed: " << SDL_GetError() << '\n';
            return false;
        }
        if (obtained.freq != kSampleRate || obtained.format != AUDIO_F32SYS || obtained.channels != 1) {
            std::cerr << "SDL capture format mismatch: frequency=" << obtained.freq
                      << " format=" << obtained.format
                      << " channels=" << static_cast<int>(obtained.channels) << '\n';
            return false;
        }
        sample_rate_ = obtained.freq;
        SDL_PauseAudioDevice(device_, 0);
        return true;
    }

    void stop() {
        if (device_) SDL_PauseAudioDevice(device_, 1);
    }

    std::vector<float> snapshot() const {
        std::lock_guard<std::mutex> lock(mutex_);
        return samples_;
    }

private:
    static void callback(void * userdata, Uint8 * stream, int byte_count) {
        auto * self = static_cast<AudioCapture *>(userdata);
        const auto * input = reinterpret_cast<const float *>(stream);
        const size_t count = static_cast<size_t>(byte_count) / sizeof(float);
        std::lock_guard<std::mutex> lock(self->mutex_);
        self->samples_.insert(self->samples_.end(), input, input + count);
        const size_t max_samples = static_cast<size_t>(self->sample_rate_) * kMaxAudioMs / 1000;
        if (self->samples_.size() > max_samples) {
            self->samples_.erase(self->samples_.begin(), self->samples_.begin() + (self->samples_.size() - max_samples));
        }
    }

    SDL_AudioDeviceID device_ = 0;
    int sample_rate_ = kSampleRate;
    mutable std::mutex mutex_;
    std::vector<float> samples_;
};

std::string trim(std::string value) {
    const auto first = value.find_first_not_of(" \t\r\n");
    if (first == std::string::npos) return {};
    const auto last = value.find_last_not_of(" \t\r\n");
    return value.substr(first, last - first + 1);
}

bool transcribe(whisper_context * context, const Options & options,
                const std::vector<float> & audio, std::string & text) {
    whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    params.print_progress = false;
    params.print_realtime = false;
    params.print_timestamps = false;
    params.print_special = false;
    params.translate = false;
    params.no_context = true;
    params.single_segment = false;
    params.language = options.language.c_str();
    params.n_threads = options.threads;
    params.temperature_inc = 0.0f;

    if (whisper_full(context, params, audio.data(), static_cast<int>(audio.size())) != 0) return false;
    text.clear();
    const int segments = whisper_full_n_segments(context);
    for (int i = 0; i < segments; ++i) text += whisper_full_get_segment_text(context, i);
    text = trim(text);
    return true;
}

} // namespace

int main(int argc, char ** argv) {
    Options options;
    if (!parse_options(argc, argv, options)) {
        emit_error("invalid-arguments");
        return 2;
    }
    if (whisper_lang_id(options.language.c_str()) < 0) {
        emit_error("invalid-language");
        return 2;
    }

    ggml_backend_load_all();
    whisper_context_params context_params = whisper_context_default_params();
    context_params.use_gpu = true;
    context_params.flash_attn = true;
    whisper_context * context = whisper_init_from_file_with_params(options.model.c_str(), context_params);
    if (!context) {
        emit_error("model-unavailable");
        return 3;
    }

    AudioCapture capture;
    if (!capture.start(options.capture_id)) {
        whisper_free(context);
        emit_error("microphone-unavailable");
        return 4;
    }

    std::atomic_bool stop{false};
    std::atomic_bool cancel{false};
    std::thread([&]() {
        std::string line;
        while (std::getline(std::cin, line)) {
            if (line.find("\"command\":\"cancel\"") != std::string::npos) {
                cancel = true;
                stop = true;
                return;
            }
            if (line.find("\"command\":\"stop\"") != std::string::npos) {
                stop = true;
                return;
            }
        }
        cancel = true;
        stop = true;
    }).detach();

    emit("{\"event\":\"ready\"}");
    auto next_partial = std::chrono::steady_clock::now() + std::chrono::milliseconds(options.partial_ms);
    std::string last_partial;

    while (!stop) {
        std::this_thread::sleep_for(std::chrono::milliseconds(25));
        if (std::chrono::steady_clock::now() < next_partial) continue;
        next_partial = std::chrono::steady_clock::now() + std::chrono::milliseconds(options.partial_ms);
        const auto audio = capture.snapshot();
        if (audio.size() < static_cast<size_t>(kSampleRate * options.min_audio_ms / 1000)) continue;
        std::string partial;
        if (!transcribe(context, options, audio, partial)) {
            capture.stop();
            whisper_free(context);
            emit_error("inference-failed");
            return 5;
        }
        if (!partial.empty() && partial != last_partial) {
            last_partial = partial;
            emit("{\"event\":\"transcript\",\"phase\":\"partial\",\"text\":\"" + json_escape(partial) + "\"}");
        }
    }

    capture.stop();
    if (cancel) {
        whisper_free(context);
        emit("{\"event\":\"cancelled\"}");
        return 0;
    }

    const auto audio = capture.snapshot();
    std::string final_text;
    if (audio.empty() || !transcribe(context, options, audio, final_text)) {
        whisper_free(context);
        emit_error("inference-failed");
        return 5;
    }
    whisper_free(context);
    emit("{\"event\":\"transcript\",\"phase\":\"final\",\"text\":\"" + json_escape(final_text) + "\"}");
    return 0;
}
