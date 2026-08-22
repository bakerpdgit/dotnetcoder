/**
 * Ready-made programs, added from the Examples menu.
 *
 * Each one is a single file that compiles and runs on its own, so choosing an
 * example and pressing Run always does something. They are written the way a
 * course would write them — ordinary C# and VB.NET, heavily commented — rather
 * than in a way that shows off this environment.
 *
 * Every example exists in both languages and teaches the same thing in each, so
 * a class can switch language without losing its way. `examples.test.ts` checks
 * that the pairs stay complete and that each one really does declare an entry
 * point.
 */
import type { LanguageId } from '../types'

/** The languages examples exist in. F# has no compiler here yet. */
export type ExampleLanguage = 'csharp' | 'vb'

export interface Example {
  id: string
  /** As it appears in the menu. */
  label: string
  /** Type and file name, without the extension. */
  name: string
  /** One line for the menu's title attribute. */
  summary: string
  sources: Record<ExampleLanguage, string>
}

// ── 1. Simple calculation ──────────────────────────────────────────────────

const EX1_CS = `using System;

// Example 1: Simple Calculation
//
// Reading a number that was typed in, and doing arithmetic with it.
// Everything typed arrives as text, so it has to be converted first.
class Example1
{
    static void Main()
    {
        Console.Write("How many apples do you have? ");
        string typed = Console.ReadLine();
        int apples = int.Parse(typed);          // text -> whole number

        Console.Write("How much does one apple cost, in pence? ");
        int pence = int.Parse(Console.ReadLine());

        int total = apples * pence;

        Console.WriteLine();
        Console.WriteLine("Apples:    " + apples);
        Console.WriteLine("Each:      " + pence + "p");
        Console.WriteLine("Total:     " + total + "p");

        // Whole-number division and remainder split the pence up.
        int pounds = total / 100;               // how many whole pounds
        int leftOver = total % 100;             // what is left over
        Console.WriteLine("That is:   " + pounds + " pounds and " + leftOver + "p");

        // Dividing by 2.0 rather than 2 keeps the decimal part.
        double half = total / 2.0;
        Console.WriteLine("Half:      " + half + "p");
    }
}
`

const EX1_VB = `Imports System

' Example 1: Simple Calculation
'
' Reading a number that was typed in, and doing arithmetic with it.
' Everything typed arrives as text, so it has to be converted first.
Module Example1
    Sub Main()
        Console.Write("How many apples do you have? ")
        Dim typed As String = Console.ReadLine()
        Dim apples As Integer = Integer.Parse(typed)    ' text -> whole number

        Console.Write("How much does one apple cost, in pence? ")
        Dim pence As Integer = Integer.Parse(Console.ReadLine())

        Dim total As Integer = apples * pence

        Console.WriteLine()
        Console.WriteLine("Apples:    " & apples)
        Console.WriteLine("Each:      " & pence & "p")
        Console.WriteLine("Total:     " & total & "p")

        ' Integer division uses \\ , and Mod gives the remainder.
        Dim pounds As Integer = total \\ 100            ' how many whole pounds
        Dim leftOver As Integer = total Mod 100         ' what is left over
        Console.WriteLine("That is:   " & pounds & " pounds and " & leftOver & "p")

        ' Ordinary division with / keeps the decimal part.
        Dim half As Double = total / 2
        Console.WriteLine("Half:      " & half & "p")
    End Sub
End Module
`

// ── 2. Control structures ──────────────────────────────────────────────────

const EX2_CS = `using System;

// Example 2: Basic Control Structures
//
// A while loop that repeats until the user stops it, a for loop that visits
// every letter of a word, and if / else if / else to decide what to do.
class Example2
{
    static void Main()
    {
        bool goAgain = true;

        // WHILE: repeats for as long as the condition stays true.
        while (goAgain)
        {
            Console.Write("Enter a word: ");
            string word = Console.ReadLine();

            int vowels = 0;

            // FOR: counts i from 0 up to the last character position.
            for (int i = 0; i < word.Length; i++)
            {
                char letter = char.ToLower(word[i]);

                // IF / ELSE IF / ELSE: choose between three cases.
                if (letter == 'a' || letter == 'e' || letter == 'i'
                        || letter == 'o' || letter == 'u')
                {
                    Console.WriteLine("  " + i + ": " + letter + " is a vowel");
                    vowels = vowels + 1;
                }
                else if (char.IsLetter(letter))
                {
                    Console.WriteLine("  " + i + ": " + letter + " is a consonant");
                }
                else
                {
                    Console.WriteLine("  " + i + ": " + letter + " is not a letter");
                }
            }

            Console.WriteLine("'" + word + "' has " + vowels + " vowel(s).");

            Console.Write("Go again (yes/no)? ");
            string answer = Console.ReadLine();
            goAgain = answer.ToLower() == "yes" || answer.ToLower() == "y";
        }

        Console.WriteLine("Finished.");
    }
}
`

const EX2_VB = `Imports System

' Example 2: Basic Control Structures
'
' A While loop that repeats until the user stops it, a For loop that visits
' every letter of a word, and If / ElseIf / Else to decide what to do.
Module Example2
    Sub Main()
        Dim goAgain As Boolean = True

        ' WHILE: repeats for as long as the condition stays true.
        While goAgain
            Console.Write("Enter a word: ")
            Dim word As String = Console.ReadLine()

            Dim vowels As Integer = 0

            ' FOR: counts i from 0 up to the last character position.
            For i As Integer = 0 To word.Length - 1
                Dim letter As Char = Char.ToLower(word(i))

                ' IF / ELSEIF / ELSE: choose between three cases.
                If letter = "a"c Or letter = "e"c Or letter = "i"c _
                        Or letter = "o"c Or letter = "u"c Then
                    Console.WriteLine("  " & i & ": " & letter & " is a vowel")
                    vowels = vowels + 1
                ElseIf Char.IsLetter(letter) Then
                    Console.WriteLine("  " & i & ": " & letter & " is a consonant")
                Else
                    Console.WriteLine("  " & i & ": " & letter & " is not a letter")
                End If
            Next

            Console.WriteLine("'" & word & "' has " & vowels & " vowel(s).")

            Console.Write("Go again (yes/no)? ")
            Dim answer As String = Console.ReadLine().ToLower()
            goAgain = (answer = "yes" Or answer = "y")
        End While

        Console.WriteLine("Finished.")
    End Sub
End Module
`

// ── 3. Data structures ─────────────────────────────────────────────────────

const EX3_CS = `using System;
using System.Collections.Generic;

// Example 3: Basic Data Structures
//
// Four ways to hold more than one value, and what each is good at.
// This one needs no input - just press Run.
class Example3
{
    static void Main()
    {
        // ---- Array: a fixed number of slots, counted from 0 ----
        int[] scores = { 7, 4, 9, 2 };
        Console.WriteLine("Array holds " + scores.Length + " numbers");
        Console.WriteLine("  first = " + scores[0] + ", last = " + scores[scores.Length - 1]);
        scores[1] = 5;                       // slots can be changed
        Array.Sort(scores);                  // but the size never changes
        Console.WriteLine("  sorted: " + string.Join(", ", scores));
        Console.WriteLine();

        // ---- Two-dimensional array: a grid, [row, column] ----
        int[,] grid = { { 1, 2, 3 }, { 4, 5, 6 } };
        Console.WriteLine("Grid row 1, column 2 = " + grid[1, 2]);
        for (int row = 0; row < grid.GetLength(0); row++)
        {
            Console.Write("  row " + row + ":");
            for (int col = 0; col < grid.GetLength(1); col++)
            {
                Console.Write(" " + grid[row, col]);
            }
            Console.WriteLine();
        }
        Console.WriteLine();

        // ---- List: grows and shrinks as you go ----
        List<string> names = new List<string>();
        names.Add("Ada");
        names.Add("Alan");
        names.Add("Grace");
        names.Remove("Alan");                // by value
        Console.WriteLine("List: " + string.Join(", ", names));
        Console.WriteLine("  count = " + names.Count);
        Console.WriteLine("  item 0 = " + names[0]);
        Console.WriteLine("  has Grace? " + names.Contains("Grace"));
        Console.WriteLine();

        // ---- Dictionary: look a value up by a key instead of a position ----
        Dictionary<string, int> ages = new Dictionary<string, int>();
        ages["Ada"] = 36;
        ages["Grace"] = 45;
        ages["Ada"] = 37;                    // same key again replaces the value
        Console.WriteLine("Dictionary: Ada is " + ages["Ada"]);
        foreach (string key in ages.Keys)
        {
            Console.WriteLine("  " + key + " -> " + ages[key]);
        }
    }
}
`

const EX3_VB = `Imports System
Imports System.Collections.Generic

' Example 3: Basic Data Structures
'
' Four ways to hold more than one value, and what each is good at.
' This one needs no input - just press Run.
Module Example3
    Sub Main()

        ' ---- Array: a fixed number of slots, counted from 0 ----
        Dim scores() As Integer = {7, 4, 9, 2}
        Console.WriteLine("Array holds " & scores.Length & " numbers")
        Console.WriteLine("  first = " & scores(0) & ", last = " & scores(scores.Length - 1))
        scores(1) = 5                        ' slots can be changed
        Array.Sort(scores)                   ' but the size never changes
        Console.WriteLine("  sorted: " & String.Join(", ", scores))
        Console.WriteLine()

        ' ---- Two-dimensional array: a grid, (row, column) ----
        Dim grid(,) As Integer = {{1, 2, 3}, {4, 5, 6}}
        Console.WriteLine("Grid row 1, column 2 = " & grid(1, 2))
        For row As Integer = 0 To grid.GetLength(0) - 1
            Console.Write("  row " & row & ":")
            For col As Integer = 0 To grid.GetLength(1) - 1
                Console.Write(" " & grid(row, col))
            Next
            Console.WriteLine()
        Next
        Console.WriteLine()

        ' ---- List: grows and shrinks as you go ----
        Dim names As New List(Of String)()
        names.Add("Ada")
        names.Add("Alan")
        names.Add("Grace")
        names.Remove("Alan")                 ' by value
        Console.WriteLine("List: " & String.Join(", ", names))
        Console.WriteLine("  count = " & names.Count)
        Console.WriteLine("  item 0 = " & names(0))
        Console.WriteLine("  has Grace? " & names.Contains("Grace"))
        Console.WriteLine()

        ' ---- Dictionary: look a value up by a key instead of a position ----
        Dim ages As New Dictionary(Of String, Integer)()
        ages("Ada") = 36
        ages("Grace") = 45
        ages("Ada") = 37                     ' same key again replaces the value
        Console.WriteLine("Dictionary: Ada is " & ages("Ada"))
        For Each key As String In ages.Keys
            Console.WriteLine("  " & key & " -> " & ages(key))
        Next
    End Sub
End Module
`

// ── 4. Files ───────────────────────────────────────────────────────────────

const EX4_CS = `using System;
using System.IO;

// Example 4: File Writing and Reading
//
// Writes what you type into Example4_Data.txt, then reads it back.
// Look in the file list on the left after running: the file is really there,
// and it is still there the next time you press Run.
class Example4
{
    static void Main()
    {
        string fileName = "Example4_Data.txt";

        // ---- Writing ----
        // StreamWriter writes a line at a time. The "using" block closes it at
        // the end, and closing is what actually saves the file.
        using (StreamWriter writer = new StreamWriter(fileName))
        {
            for (int i = 1; i <= 3; i++)
            {
                Console.Write("Friend " + i + " - first name: ");
                string name = Console.ReadLine();

                Console.Write("Friend " + i + " - age: ");
                string age = Console.ReadLine();

                // One record per line, with a comma between the two fields.
                writer.WriteLine(name + "," + age);
            }
        }

        Console.WriteLine();
        Console.WriteLine("Saved " + fileName);
        Console.WriteLine();

        // ---- Reading it back ----
        string[] lines = File.ReadAllLines(fileName);

        foreach (string line in lines)
        {
            // Split cuts the line wherever it finds a comma.
            string[] parts = line.Split(',');
            string name = parts[0];
            int age = int.Parse(parts[1]);

            Console.WriteLine(name + " is " + age + ", and next year will be " + (age + 1));
        }

        // ---- Folders work too ----
        Directory.CreateDirectory("Example4_Output");
        File.WriteAllText("Example4_Output/summary.txt", lines.Length + " friends saved.");
        Console.WriteLine();
        Console.WriteLine("Also wrote Example4_Output/summary.txt");
    }
}
`

const EX4_VB = `Imports System
Imports System.IO

' Example 4: File Writing and Reading
'
' Writes what you type into Example4_Data.txt, then reads it back.
' Look in the file list on the left after running: the file is really there,
' and it is still there the next time you press Run.
Module Example4
    Sub Main()
        Dim fileName As String = "Example4_Data.txt"

        ' ---- Writing ----
        ' StreamWriter writes a line at a time. The Using block closes it at
        ' the end, and closing is what actually saves the file.
        Using writer As New StreamWriter(fileName)
            For i As Integer = 1 To 3
                Console.Write("Friend " & i & " - first name: ")
                Dim name As String = Console.ReadLine()

                Console.Write("Friend " & i & " - age: ")
                Dim age As String = Console.ReadLine()

                ' One record per line, with a comma between the two fields.
                writer.WriteLine(name & "," & age)
            Next
        End Using

        Console.WriteLine()
        Console.WriteLine("Saved " & fileName)
        Console.WriteLine()

        ' ---- Reading it back ----
        Dim lines() As String = File.ReadAllLines(fileName)

        For Each line As String In lines
            ' Split cuts the line wherever it finds a comma.
            Dim parts() As String = line.Split(","c)
            Dim name As String = parts(0)
            Dim age As Integer = Integer.Parse(parts(1))

            Console.WriteLine(name & " is " & age & ", and next year will be " & (age + 1))
        Next

        ' ---- Folders work too ----
        Directory.CreateDirectory("Example4_Output")
        File.WriteAllText("Example4_Output/summary.txt", lines.Length & " friends saved.")
        Console.WriteLine()
        Console.WriteLine("Also wrote Example4_Output/summary.txt")
    End Sub
End Module
`

// ── 5. Multiple classes ────────────────────────────────────────────────────

const EX5_CS = `using System;

// Example 5: Multiple Classes
//
// One class to run, and another to describe a thing. Each Book object keeps
// its own values; the methods say what a Book can do.
class Example5
{
    static void Main()
    {
        Book emma = new Book("Emma", "Jane Austen", 474);
        Book holes = new Book("Holes", "Louis Sachar", 233);

        emma.Describe();
        holes.Describe();
        Console.WriteLine();

        // A static method belongs to the class rather than to one object.
        Console.WriteLine("The longer book is " + Book.Longer(emma, holes).Title);
        Console.WriteLine();

        holes.Read(50);
        holes.Read(150);
        holes.Describe();
    }
}

/// <summary>A second class, in the same file.</summary>
class Book
{
    // Fields: what every Book remembers. private = only Book can touch them.
    private string title;
    private string author;
    private int pages;
    private int pagesRead;

    // Constructor: runs once, when you say new Book(...).
    public Book(string title, string author, int pages)
    {
        this.title = title;       // "this.title" is the field,
        this.author = author;     // "title" on the right is the parameter
        this.pages = pages;
        this.pagesRead = 0;
    }

    // A property lets other classes read a private field without changing it.
    public string Title
    {
        get { return title; }
    }

    public void Read(int howMany)
    {
        pagesRead = pagesRead + howMany;
        if (pagesRead > pages)
        {
            pagesRead = pages;    // cannot read past the end
        }
    }

    public void Describe()
    {
        int percent = pagesRead * 100 / pages;
        Console.WriteLine(title + " by " + author);
        Console.WriteLine("  " + pages + " pages, " + percent + "% read");
    }

    // Static: called on the class itself, as Book.Longer(a, b).
    public static Book Longer(Book one, Book two)
    {
        if (one.pages >= two.pages)
        {
            return one;
        }
        return two;
    }
}
`

const EX5_VB = `Imports System

' Example 5: Multiple Classes
'
' One module to run, and a class to describe a thing. Each Book object keeps
' its own values; the methods say what a Book can do.
Module Example5
    Sub Main()
        Dim emma As New Book("Emma", "Jane Austen", 474)
        Dim holes As New Book("Holes", "Louis Sachar", 233)

        emma.Describe()
        holes.Describe()
        Console.WriteLine()

        ' A Shared method belongs to the class rather than to one object.
        Console.WriteLine("The longer book is " & Book.Longer(emma, holes).Title)
        Console.WriteLine()

        holes.Read(50)
        holes.Read(150)
        holes.Describe()
    End Sub
End Module

''' <summary>A class, in the same file.</summary>
Class Book
    ' Fields: what every Book remembers. Private = only Book can touch them.
    Private m_title As String
    Private m_author As String
    Private m_pages As Integer
    Private m_pagesRead As Integer

    ' Constructor: runs once, when you say New Book(...).
    Public Sub New(title As String, author As String, pages As Integer)
        m_title = title
        m_author = author
        m_pages = pages
        m_pagesRead = 0
    End Sub

    ' A property lets other code read a private field without changing it.
    Public ReadOnly Property Title As String
        Get
            Return m_title
        End Get
    End Property

    Public Sub Read(howMany As Integer)
        m_pagesRead = m_pagesRead + howMany
        If m_pagesRead > m_pages Then
            m_pagesRead = m_pages           ' cannot read past the end
        End If
    End Sub

    Public Sub Describe()
        Dim percent As Integer = m_pagesRead * 100 \\ m_pages
        Console.WriteLine(m_title & " by " & m_author)
        Console.WriteLine("  " & m_pages & " pages, " & percent & "% read")
    End Sub

    ' Shared: called on the class itself, as Book.Longer(a, b).
    Public Shared Function Longer(one As Book, two As Book) As Book
        If one.m_pages >= two.m_pages Then
            Return one
        End If
        Return two
    End Function
End Class
`

// ── 6. Inheritance ─────────────────────────────────────────────────────────

const EX6_CS = `using System;

// Example 6: Inheritance
//
// Dog and Cat are both Animals, so they get everything Animal has and can
// change the parts that differ. The same call then behaves differently
// depending on the object - which is called polymorphism.
class Example6
{
    static void Main()
    {
        // All three fit in an Animal[], because a Dog IS an Animal.
        Animal[] pets = { new Dog("Rex"), new Cat("Momo"), new Animal("Spike") };

        foreach (Animal pet in pets)
        {
            pet.Introduce();     // same line, three different results
        }
        Console.WriteLine();

        Dog rex = new Dog("Rex");
        rex.Introduce();         // inherited from Animal
        rex.Fetch();             // only a Dog has this

        Console.WriteLine();
        Console.WriteLine("Is rex an Animal? " + (rex is Animal));
    }
}

/// <summary>The parent class.</summary>
class Animal
{
    // protected = this class and anything that inherits from it can use it.
    protected string name;

    public Animal(string name)
    {
        this.name = name;
    }

    // virtual = a child class is allowed to replace this.
    public virtual string Speak()
    {
        return "...";
    }

    // Every Animal introduces itself the same way...
    public void Introduce()
    {
        Console.WriteLine(name + " the " + Kind() + " says " + Speak());
    }

    // ...though each kind names itself.
    public virtual string Kind()
    {
        return "animal";
    }
}

// ": Animal" means a Dog starts as an Animal and changes two things.
class Dog : Animal
{
    public Dog(string name)
        : base(name)         // base(...) runs the Animal constructor
    {
    }

    public override string Speak()
    {
        return "Woof";
    }

    public override string Kind()
    {
        return "dog";
    }

    // Extra behaviour, which only a Dog has.
    public void Fetch()
    {
        Console.WriteLine(name + " fetches the ball.");
    }
}

class Cat : Animal
{
    public Cat(string name)
        : base(name)
    {
    }

    public override string Speak()
    {
        return "Meow";
    }

    public override string Kind()
    {
        return "cat";
    }
}
`

const EX6_VB = `Imports System

' Example 6: Inheritance
'
' Dog and Cat are both Animals, so they get everything Animal has and can
' change the parts that differ. The same call then behaves differently
' depending on the object - which is called polymorphism.
Module Example6
    Sub Main()
        ' All three fit in an Animal array, because a Dog IS an Animal.
        Dim pets() As Animal = {New Dog("Rex"), New Cat("Momo"), New Animal("Spike")}

        For Each pet As Animal In pets
            pet.Introduce()      ' same line, three different results
        Next
        Console.WriteLine()

        Dim rex As New Dog("Rex")
        rex.Introduce()          ' inherited from Animal
        rex.Fetch()              ' only a Dog has this

        Console.WriteLine()
        Console.WriteLine("Is rex an Animal? " & (TypeOf rex Is Animal))
    End Sub
End Module

''' <summary>The parent class.</summary>
Class Animal
    ' Protected = this class and anything that inherits from it can use it.
    Protected m_name As String

    Public Sub New(name As String)
        m_name = name
    End Sub

    ' Overridable = a child class is allowed to replace this.
    Public Overridable Function Speak() As String
        Return "..."
    End Function

    ' Every Animal introduces itself the same way...
    Public Sub Introduce()
        Console.WriteLine(m_name & " the " & Kind() & " says " & Speak())
    End Sub

    ' ...though each kind names itself.
    Public Overridable Function Kind() As String
        Return "animal"
    End Function
End Class

' Inherits Animal: a Dog starts as an Animal and changes two things.
Class Dog
    Inherits Animal

    Public Sub New(name As String)
        MyBase.New(name)         ' MyBase.New runs the Animal constructor
    End Sub

    Public Overrides Function Speak() As String
        Return "Woof"
    End Function

    Public Overrides Function Kind() As String
        Return "dog"
    End Function

    ' Extra behaviour, which only a Dog has.
    Public Sub Fetch()
        Console.WriteLine(m_name & " fetches the ball.")
    End Sub
End Class

Class Cat
    Inherits Animal

    Public Sub New(name As String)
        MyBase.New(name)
    End Sub

    Public Overrides Function Speak() As String
        Return "Meow"
    End Function

    Public Overrides Function Kind() As String
        Return "cat"
    End Function
End Class
`

// ── 7. Methods and parameters ──────────────────────────────────────────────

const EX7_CS = `using System;

// Example 7: Methods and Parameters
//
// Breaking a program into named jobs. A method takes parameters, may return
// a value, and can be called as many times as you like.
class Example7
{
    static void Main()
    {
        Console.Write("Enter your name: ");
        string name = Console.ReadLine();

        Greet(name);           // returns nothing
        Greet(name, 2);        // same name, different parameters: overloading
        Console.WriteLine();

        int a = 12;
        int b = 30;

        Console.WriteLine(a + " + " + b + " = " + Add(a, b));
        Console.WriteLine("The bigger one is " + Biggest(a, b));

        int[] marks = { 8, 5, 9 };
        Console.WriteLine("Average mark: " + Average(marks));
    }

    // void means it does something but hands nothing back.
    static void Greet(string who)
    {
        Console.WriteLine("Hello, " + who + "!");
    }

    // Overloading: the same name with a different parameter list.
    static void Greet(string who, int times)
    {
        for (int i = 0; i < times; i++)
        {
            Console.WriteLine("Hello again, " + who + "!");
        }
    }

    // int means it hands an int back, with return.
    static int Add(int x, int y)
    {
        return x + y;
    }

    static int Biggest(int x, int y)
    {
        if (x > y)
        {
            return x;         // return leaves the method straight away
        }
        return y;
    }

    // A whole array can be a parameter too.
    static double Average(int[] values)
    {
        int total = 0;
        foreach (int value in values)
        {
            total = total + value;
        }
        return (double)total / values.Length;
    }
}
`

const EX7_VB = `Imports System

' Example 7: Methods and Parameters
'
' Breaking a program into named jobs. A Sub does something, a Function hands
' a value back, and either can be called as many times as you like.
Module Example7
    Sub Main()
        Console.Write("Enter your name: ")
        Dim name As String = Console.ReadLine()

        Greet(name)            ' returns nothing
        Greet(name, 2)         ' same name, different parameters: overloading
        Console.WriteLine()

        Dim a As Integer = 12
        Dim b As Integer = 30

        Console.WriteLine(a & " + " & b & " = " & Add(a, b))
        Console.WriteLine("The bigger one is " & Biggest(a, b))

        Dim marks() As Integer = {8, 5, 9}
        Console.WriteLine("Average mark: " & Average(marks))
    End Sub

    ' A Sub does something but hands nothing back.
    Sub Greet(who As String)
        Console.WriteLine("Hello, " & who & "!")
    End Sub

    ' Overloading: the same name with a different parameter list.
    Sub Greet(who As String, times As Integer)
        For i As Integer = 1 To times
            Console.WriteLine("Hello again, " & who & "!")
        Next
    End Sub

    ' A Function hands a value back, with Return.
    Function Add(x As Integer, y As Integer) As Integer
        Return x + y
    End Function

    Function Biggest(x As Integer, y As Integer) As Integer
        If x > y Then
            Return x          ' Return leaves the function straight away
        End If
        Return y
    End Function

    ' A whole array can be a parameter too.
    Function Average(values() As Integer) As Double
        Dim total As Integer = 0
        For Each value As Integer In values
            total = total + value
        Next
        Return CDbl(total) / values.Length
    End Function
End Module
`

// ── 8. Errors and validation ───────────────────────────────────────────────

const EX8_CS = `using System;
using System.IO;

// Example 8: Errors and Checking Input
//
// try / catch lets a program carry on when something goes wrong, instead of
// stopping. Typing something that is not a number is the usual case.
class Example8
{
    static void Main()
    {
        int age = -1;

        // Keep asking until the answer makes sense.
        while (age < 0)
        {
            Console.Write("How old are you? ");
            string typed = Console.ReadLine();

            try
            {
                age = int.Parse(typed);          // throws if it is not a number
                if (age < 0)
                {
                    Console.WriteLine("  An age cannot be negative. Try again.");
                }
            }
            catch (FormatException e)
            {
                // Message describes what went wrong.
                Console.WriteLine("  '" + typed + "' is not a whole number.");
                Console.WriteLine("  (" + e.Message + ")");
            }
        }

        Console.WriteLine("Thank you. Next year you will be " + (age + 1) + ".");
        Console.WriteLine();

        // ---- Asking without throwing at all ----
        // TryParse hands back true or false instead of raising an error, which
        // is usually the tidier way to check something typed in.
        Console.Write("Pick a number to divide 100 by: ");
        int divisor;
        if (int.TryParse(Console.ReadLine(), out divisor) && divisor != 0)
        {
            Console.WriteLine("100 / " + divisor + " = " + (100 / divisor));
        }
        else
        {
            Console.WriteLine("That was not a number I can divide by.");
        }
        Console.WriteLine();

        // ---- Throwing an error on purpose ----
        try
        {
            CheckAge(age);
            Console.WriteLine("That age passed the check.");
        }
        catch (Exception e)
        {
            Console.WriteLine("Rejected: " + e.Message);
        }
        finally
        {
            // finally runs whether or not there was an error.
            Console.WriteLine("Finished checking.");
        }
        Console.WriteLine();

        // ---- An error from the library ----
        try
        {
            Console.WriteLine(File.ReadAllText("no_such_file.txt"));
        }
        catch (IOException e)
        {
            Console.WriteLine("Could not open the file: " + e.Message);
        }
    }

    // throw hands an error back to whoever called this method.
    static void CheckAge(int age)
    {
        if (age > 150)
        {
            throw new Exception(age + " is older than anyone has ever been");
        }
    }
}
`

const EX8_VB = `Imports System
Imports System.IO

' Example 8: Errors and Checking Input
'
' Try / Catch lets a program carry on when something goes wrong, instead of
' stopping. Typing something that is not a number is the usual case.
Module Example8
    Sub Main()
        Dim age As Integer = -1

        ' Keep asking until the answer makes sense.
        While age < 0
            Console.Write("How old are you? ")
            Dim typed As String = Console.ReadLine()

            Try
                age = Integer.Parse(typed)       ' throws if it is not a number
                If age < 0 Then
                    Console.WriteLine("  An age cannot be negative. Try again.")
                End If
            Catch e As FormatException
                ' Message describes what went wrong.
                Console.WriteLine("  '" & typed & "' is not a whole number.")
                Console.WriteLine("  (" & e.Message & ")")
            End Try
        End While

        Console.WriteLine("Thank you. Next year you will be " & (age + 1) & ".")
        Console.WriteLine()

        ' ---- Asking without throwing at all ----
        ' TryParse hands back True or False instead of raising an error, which
        ' is usually the tidier way to check something typed in.
        Console.Write("Pick a number to divide 100 by: ")
        Dim divisor As Integer
        If Integer.TryParse(Console.ReadLine(), divisor) AndAlso divisor <> 0 Then
            Console.WriteLine("100 / " & divisor & " = " & (100 \\ divisor))
        Else
            Console.WriteLine("That was not a number I can divide by.")
        End If
        Console.WriteLine()

        ' ---- Throwing an error on purpose ----
        Try
            CheckAge(age)
            Console.WriteLine("That age passed the check.")
        Catch e As Exception
            Console.WriteLine("Rejected: " & e.Message)
        Finally
            ' Finally runs whether or not there was an error.
            Console.WriteLine("Finished checking.")
        End Try
        Console.WriteLine()

        ' ---- An error from the library ----
        Try
            Console.WriteLine(File.ReadAllText("no_such_file.txt"))
        Catch e As IOException
            Console.WriteLine("Could not open the file: " & e.Message)
        End Try
    End Sub

    ' Throw hands an error back to whoever called this method.
    Sub CheckAge(age As Integer)
        If age > 150 Then
            Throw New Exception(age & " is older than anyone has ever been")
        End If
    End Sub
End Module
`

export const EXAMPLES: Example[] = [
  {
    id: 'ex1',
    label: 'Ex. 1: Simple Calculation',
    name: 'Example1',
    summary: 'Reading a number and doing arithmetic with it',
    sources: { csharp: EX1_CS, vb: EX1_VB },
  },
  {
    id: 'ex2',
    label: 'Ex. 2: Basic Control Structures',
    name: 'Example2',
    summary: 'while, for, and if / else if / else',
    sources: { csharp: EX2_CS, vb: EX2_VB },
  },
  {
    id: 'ex3',
    label: 'Ex. 3: Basic Data Structures',
    name: 'Example3',
    summary: 'Arrays, 2D arrays, List and Dictionary',
    sources: { csharp: EX3_CS, vb: EX3_VB },
  },
  {
    id: 'ex4',
    label: 'Ex. 4: File Writing & Reading',
    name: 'Example4',
    summary: 'Writing a data file and reading it back',
    sources: { csharp: EX4_CS, vb: EX4_VB },
  },
  {
    id: 'ex5',
    label: 'Ex. 5: Multiple Classes',
    name: 'Example5',
    summary: 'Fields, constructors, properties and a second class',
    sources: { csharp: EX5_CS, vb: EX5_VB },
  },
  {
    id: 'ex6',
    label: 'Ex. 6: Inheritance',
    name: 'Example6',
    summary: 'Base classes, overriding and polymorphism',
    sources: { csharp: EX6_CS, vb: EX6_VB },
  },
  {
    id: 'ex7',
    label: 'Ex. 7: Methods & Parameters',
    name: 'Example7',
    summary: 'Parameters, return values and overloading',
    sources: { csharp: EX7_CS, vb: EX7_VB },
  },
  {
    id: 'ex8',
    label: 'Ex. 8: Errors & Checking Input',
    name: 'Example8',
    summary: 'try / catch / finally, TryParse, and validating input',
    sources: { csharp: EX8_CS, vb: EX8_VB },
  },
]

/** True when `language` has example sources — F# does not, yet. */
export function hasExamples(language: LanguageId): language is ExampleLanguage {
  return language === 'csharp' || language === 'vb'
}

export function findExample(id: string): Example | undefined {
  return EXAMPLES.find(example => example.id === id)
}

/** Where the example is written in the active filesystem. */
export function examplePath(example: Example, language: ExampleLanguage): string {
  return `/${example.name}${language === 'vb' ? '.vb' : '.cs'}`
}

export function exampleSource(example: Example, language: ExampleLanguage): string {
  return example.sources[language]
}
