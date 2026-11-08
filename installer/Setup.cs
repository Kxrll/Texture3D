using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;
using System.Web.Script.Serialization;
using System.Threading.Tasks;
using System.Collections.Generic;
[assembly: AssemblyVersion("0.8.0.0")]
[assembly: AssemblyFileVersion("0.8.0.0")]
[assembly: AssemblyProduct("Texture3D Studio")]
[assembly: AssemblyTitle("Installation Texture3D")]
class SoftButton:Button {
 public Color Fill=Color.FromArgb(160,86,112);
 public SoftButton(){FlatStyle=FlatStyle.Flat;FlatAppearance.BorderSize=0;Cursor=Cursors.Hand;ForeColor=Color.White;Font=new Font("Segoe UI",11,FontStyle.Bold);}
 public static GraphicsPath Shape(Rectangle r,int radius){var p=new GraphicsPath();int d=radius*2;p.AddArc(r.X,r.Y,d,d,180,90);p.AddArc(r.Right-d,r.Y,d,d,270,90);p.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);p.AddArc(r.X,r.Bottom-d,d,d,90,90);p.CloseFigure();return p;}
 protected override void OnPaint(PaintEventArgs e){e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;using(var p=Shape(new Rectangle(0,0,Width-1,Height-1),Height/2))using(var b=new SolidBrush(Enabled?Fill:Color.FromArgb(191,173,171)))e.Graphics.FillPath(b,p);TextRenderer.DrawText(e.Graphics,Text,Font,ClientRectangle,ForeColor,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter);if(Focused)ControlPaint.DrawFocusRectangle(e.Graphics,new Rectangle(12,8,Width-24,Height-16));}
}
class Installer:Form {
 public bool DetectionComplete { get { return !working; } }
 readonly string folder; readonly bool preview;
 Color ink=Color.FromArgb(65,48,48),muted=Color.FromArgb(126,104,102);
 Label title,description,blender,photoshop,destination,state,version;
 SoftButton action,choose; LinkLabel logLink;
 Panel progress; int percent; bool working,ready,completed; string chosen="";string error="";
 public Installer(string dir,bool isPreview){folder=dir;preview=isPreview;Text="Texture3D · Installation";ClientSize=new Size(560,360);MinimumSize=MaximumSize=Size;FormBorderStyle=FormBorderStyle.FixedSingle;MaximizeBox=false;StartPosition=FormStartPosition.CenterScreen;BackColor=Color.FromArgb(246,238,232);Font=new Font("Segoe UI",10);ForeColor=ink;AutoScaleMode=AutoScaleMode.Dpi;DoubleBuffered=true;
 try{Icon=new Icon(Path.Combine(dir,"app","assets","texture3d.ico"));}catch{}
 Label brand=LabelAt("texture3D",38,28,450,45,23,true);version=LabelAt("STUDIO  /  0.8.0",610,42,180,24,10,false);version.ForeColor=muted;
 title=LabelAt("Un nouvel espace pour peindre.",38,102,744,50,25,true);
 description=LabelAt("Ton modèle dans Blender. Ta peinture dans Photoshop.\nEt le résultat, juste à côté.",40,165,720,57,12,false);description.ForeColor=muted;
 blender=LabelAt("Recherche de Blender…",60,254,690,52,11,true);
 photoshop=LabelAt("Recherche de Photoshop…",60,327,690,46,11,true);
 destination=LabelAt("Installation pour ton compte Windows",60,399,690,47,10,false);destination.ForeColor=muted;
 choose=new SoftButton{Text="Choisir Blender",Left=590,Top=205,Width=190,Height=36,Fill=Color.FromArgb(225,210,203),ForeColor=ink};choose.Click+=(s,e)=>{using(var dlg=new OpenFileDialog{Filter="Blender|blender.exe",Title="Choisir Blender"}){if(dlg.ShowDialog()==DialogResult.OK){chosen=dlg.FileName;Inspect();}}};Controls.Add(choose);
 progress=new Panel{Left=40,Top=478,Width=740,Height=7,BackColor=Color.FromArgb(226,211,204)};progress.Paint+=(s,e)=>{using(var brush=new SolidBrush(Color.FromArgb(160,86,112)))e.Graphics.FillRectangle(brush,0,0,progress.Width*percent/100,progress.Height);};Controls.Add(progress);
 state=LabelAt("Détection automatique en cours…",40,499,740,58,10,false);state.ForeColor=muted;
 action=new SoftButton{Text="Préparation…",Left=490,Top=579,Width=290,Height=48,Enabled=false};action.Click+=(s,e)=>{if(completed){Close();return;}Install();};Controls.Add(action);
 logLink=new LinkLabel{Text="Consulter le journal",Left=40,Top=594,Width=220,Height=26,LinkColor=muted,Visible=false};logLink.LinkClicked+=(s,e)=>{string p=Path.Combine(Path.GetTempPath(),"Texture3D-installation.log");if(File.Exists(p))Process.Start("notepad.exe","\""+p+"\"");};Controls.Add(logLink);
 brand.Visible=false;version.Visible=false;title.Visible=false;description.Visible=false;blender.SetBounds(36,32,480,48);photoshop.SetBounds(36,100,480,42);destination.SetBounds(36,160,480,43);choose.SetBounds(370,218,165,32);progress.SetBounds(24,261,512,5);state.SetBounds(24,275,512,32);action.SetBounds(286,307,250,40);logLink.SetBounds(24,318,240,25);FormClosing+=(s,e)=>{if(working)e.Cancel=true;};Shown+=(s,e)=>{if(preview){ApplyPreview();}else Inspect();};
 }
 Label LabelAt(string text,int x,int y,int w,int h,float size,bool bold){var l=new Label{Text=text,Left=x,Top=y,Width=w,Height=h,BackColor=Color.Transparent,Font=new Font("Segoe UI",size,bold?FontStyle.Bold:FontStyle.Regular),AutoEllipsis=true};Controls.Add(l);return l;}
 protected override void OnPaint(PaintEventArgs e){base.OnPaint(e);e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;using(var b=new SolidBrush(Color.FromArgb(255,250,246)))using(var p=SoftButton.Shape(new Rectangle(20,18,520,194),24))e.Graphics.FillPath(b,p);using(var pen=new Pen(Color.FromArgb(236,223,215))){e.Graphics.DrawLine(pen,36,90,524,90);e.Graphics.DrawLine(pen,36,150,524,150);}}
 string Run(string mode,bool live){var psi=new ProcessStartInfo("powershell.exe","-NoProfile -ExecutionPolicy Bypass -STA -File \""+Path.Combine(folder,"setup.ps1")+"\" -Mode "+mode+(chosen.Length>0?" -BlenderPath \""+chosen+"\"":"")){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=System.Text.Encoding.UTF8,StandardErrorEncoding=System.Text.Encoding.UTF8};using(var p=new Process{StartInfo=psi}){p.Start();var stderr=p.StandardError.ReadToEndAsync();string output="",line;while((line=p.StandardOutput.ReadLine())!=null){output+=line+"\n";if(live&&line.StartsWith("T3D|")){var fields=line.Split(new[]{'|'},3);int n;if(fields.Length==3&&int.TryParse(fields[1],out n)){string message=fields[2];BeginInvoke((Action)(()=>{percent=n;state.Text=message;progress.Invalidate();}));if(n==0)error=message;}}}p.WaitForExit();string errors=stderr.Result;if(p.ExitCode!=0)throw new Exception(error.Length>0?error:(errors.Length>0?errors:output));return output;}}
 async void Inspect(){working=true;action.Enabled=false;choose.Enabled=false;try{string json=await Task.Run(()=>Run("Inspect",false));var data=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(json);var list=(System.Collections.ArrayList)data["blenders"];bool installed=(bool)data["installed"];title.Text=installed?"Ton studio, à jour.":"Un nouvel espace pour peindre.";description.Text=installed?"La nouvelle version remplace l’ancienne.\nTes projets et tes peintures restent à leur place.":"Ton modèle dans Blender. Ta peinture dans Photoshop.\nEt le résultat, juste à côté.";
 blender.Text=list.Count>0?"BLENDER  ·  Détecté\n"+(chosen.Length>0?chosen:list[0].ToString()):"BLENDER  ·  À sélectionner";
 photoshop.Text=(bool)data["photoshop"]&&(bool)data["adobe"]?"PHOTOSHOP  ·  Détecté\nPlugin installé via Adobe Creative Cloud":"PHOTOSHOP  ·  Vérification nécessaire\nPhotoshop et Creative Cloud Desktop sont requis";
 destination.Text=""+(installed?"Version "+(data["previousVersion"]??"précédente")+" → 0.8.0":"Version 0.8.0")+"\n"+data["target"];
 ready=list.Count>0&&(bool)data["photoshop"]&&(bool)data["adobe"];state.Text="Ferme Blender et Photoshop avant de continuer.";action.Text=installed?"Mettre à jour Texture3D":"Installer Texture3D";
 }catch(Exception ex){state.Text=ex.Message;ready=false;}finally{working=false;choose.Enabled=true;action.Enabled=ready;}}
 async void Install(){working=true;error="";action.Enabled=false;choose.Enabled=false;logLink.Visible=true;action.Text="Installation en cours…";try{await Task.Run(()=>Run("Install",true));completed=true;title.Text="Tout est prêt.";description.Text="Ouvre Blender, sélectionne ton modèle et retrouve\nTexture3D dans la barre latérale avec la touche N.";action.Text="C’est parti";percent=100;progress.Invalidate();}catch(Exception ex){title.Text="On reprend ici.";state.Text=ex.Message;action.Text="Réessayer";}finally{working=false;action.Enabled=true;choose.Enabled=!completed;}}
 public void ApplyPreview(){title.Text="Ton studio, à jour.";description.Text="La nouvelle version remplace l’ancienne.\nTes projets et tes peintures restent à leur place.";blender.Text="BLENDER  ·  Détecté\nBlender 5.1";photoshop.Text="PHOTOSHOP  ·  Détecté\nPlugin installé via Adobe Creative Cloud";destination.Text="Version 0.6.0 → 0.8.0\nMême emplacement, mêmes raccourcis.";state.Text="Ferme Blender et Photoshop avant de continuer.";action.Text="Mettre à jour Texture3D";action.Enabled=true;}
}
class Setup {
 [STAThread] static int Main(string[] args){Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);string dir=Path.Combine(Path.GetTempPath(),"Texture3D-Setup-"+Guid.NewGuid().ToString("N"));System.Threading.Mutex mutex=null;try{
 bool created;mutex=new System.Threading.Mutex(true,"Local\\Texture3DInstaller",out created);if(!created){MessageBox.Show("Un installateur Texture3D est déjà ouvert.");return 2;}
 Directory.CreateDirectory(dir);using(var stream=Assembly.GetExecutingAssembly().GetManifestResourceStream("payload.zip"))using(var zip=new ZipArchive(stream)){foreach(var e in zip.Entries){string p=Path.GetFullPath(Path.Combine(dir,e.FullName));if(!p.StartsWith(dir+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase))throw new Exception("Archive invalide");Directory.CreateDirectory(Path.GetDirectoryName(p));if(e.Name.Length>0)e.ExtractToFile(p);}}
 if(args.Length==2&&args[0]=="--verify"){File.WriteAllText(args[1],File.ReadAllText(Path.Combine(dir,"package-files.json")));return 0;}
 using(var form=new Installer(dir,args.Length>0&&args[0]=="--preview")){
 if(args.Length==2&&args[0]=="--preview"){form.Show();form.ApplyPreview();Application.DoEvents();using(var bmp=new Bitmap(form.Width,form.Height)){form.DrawToBitmap(bmp,new Rectangle(Point.Empty,form.Size));bmp.Save(args[1]);}form.Close();return 0;}
 if(args.Length==2&&args[0]=="--preview-detected"){
  var timer=new System.Windows.Forms.Timer{Interval=200};timer.Tick+=(s,e)=>{if(form.DetectionComplete){timer.Stop();using(var bmp=new Bitmap(form.Width,form.Height)){form.DrawToBitmap(bmp,new Rectangle(Point.Empty,form.Size));bmp.Save(args[1]);}form.Close();}};timer.Start();Application.Run(form);timer.Dispose();return 0;
 }
 Application.Run(form);return 0;}
 }catch(Exception e){MessageBox.Show(e.Message,"Installation Texture3D",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}finally{if(mutex!=null)mutex.Dispose();try{if(Directory.Exists(dir))Directory.Delete(dir,true);}catch{}}}
}
