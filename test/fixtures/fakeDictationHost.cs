using System;
using System.IO;
using System.Text;

internal static class FakeDictationHost
{
    public static int Main(string[] args)
    {
        string argsPath = Environment.GetEnvironmentVariable("DSHMUX_TEST_ARGS_PATH");
        if (String.IsNullOrEmpty(argsPath))
        {
            return 3;
        }

        File.WriteAllLines(argsPath, args, new UTF8Encoding(false));
        Console.OutputEncoding = new UTF8Encoding(false);
        Console.WriteLine("{\"event\":\"ready\"}");
        Console.WriteLine("{\"event\":\"transcript\",\"phase\":\"partial\",\"text\":\"Tere\"}");

        string line;
        while ((line = Console.ReadLine()) != null)
        {
            if (line.Contains("\"command\":\"stop\""))
            {
                Console.WriteLine("{\"event\":\"transcript\",\"phase\":\"final\",\"text\":\"Tere maailm.\"}");
                return 0;
            }
        }

        return 4;
    }
}
