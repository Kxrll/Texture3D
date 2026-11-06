using System;using System.IO;using System.IO.Compression;using System.Reflection;using System.Diagnostics;using System.Windows.Forms;
class Setup {
 [STAThread] static int Main(string[] args){string dir=Path.Combine(Path.GetTempPath(),"Texture3D-Setup-"+Guid.NewGuid().ToString("N"));try{
 Directory.CreateDirectory(dir);using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))using(var zip=new ZipArchive(stream)){foreach(var e in zip.Entries){string p=Path.GetFullPath(Path.Combine(dir,e.FullName));if(!p.StartsWith(dir+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new Exception("Archive invalide");Directory.CreateDirectory(Path.GetDirectoryName(p));if(e.Name.Length>0)e.ExtractToFile(p);}}
 if(args.Length==2&&args[0]=="--verify"){File.WriteAllText(args[1],File.ReadAllText(Path.Combine(dir,"package-files.json")));return 0;}
 var start=new ProcessStartInfo("powershell.exe","-NoProfile -ExecutionPolicy Bypass -STA -File \""+Path.Combine(dir,"setup.ps1")+"\"");start.UseShellExecute=false;start.CreateNoWindow=true;var process=Process.Start(start);process.WaitForExit();return process.ExitCode;
 }catch(Exception e){MessageBox.Show(e.Message,"Installation Texture3D",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}finally{if(Directory.Exists(dir))Directory.Delete(dir,true);}}
}
