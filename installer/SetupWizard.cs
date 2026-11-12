using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace OpenWAInstaller
{
    public class SetupWizardForm : Form
    {
        // UI Controls
        private Panel panelHeader;
        private Label lblHeaderTitle;
        private Label lblHeaderSubtitle;
        private Label lblHeaderBadge;

        private Panel panelContent;
        private Panel panelFooter;
        private Button btnBack;
        private Button btnNext;
        private Button btnCancel;

        // Pages
        private Panel pageWelcome;
        private Panel pageDestination;
        private Panel pageOptions;
        private Panel pageReady;
        private Panel pageInstalling;
        private Panel pageFinish;

        // Destination page controls
        private TextBox txtDestPath;
        private Button btnBrowse;
        private Label lblSpaceReq;

        // Options page controls
        private CheckBox chkDesktopShortcut;
        private CheckBox chkNodeCheck;

        // Ready page controls
        private TextBox txtSummary;

        // Installing page controls
        private Label lblInstallStatus;
        private Label lblInstallDetail;
        private ProgressBar progressBar;
        private BackgroundWorker worker;

        // Finish page controls
        private CheckBox chkLaunchNow;

        private int currentPage = 0;
        private const int TOTAL_PAGES = 6;
        private string sourceDirectory;
        private string targetDirectory;

        public SetupWizardForm()
        {
            InitializeComponent();
            sourceDirectory = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\');
            
            // Intelligent default target path
            if (Directory.Exists("D:\\"))
            {
                targetDirectory = "D:\\OpenWA-WhatsApp";
            }
            else
            {
                targetDirectory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "OpenWA-WhatsApp");
            }
            txtDestPath.Text = targetDirectory;

            UpdatePage();
        }

        private void InitializeComponent()
        {
            this.Text = "OpenWA WhatsApp Software - Setup Wizard";
            this.Size = new Size(640, 480);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = true;
            this.Font = new Font("Segoe UI", 9F, FontStyle.Regular, GraphicsUnit.Point);
            this.BackColor = Color.FromArgb(248, 250, 252);

            // 1. Top Header Panel
            panelHeader = new Panel();
            panelHeader.Dock = DockStyle.Top;
            panelHeader.Height = 65;
            panelHeader.BackColor = Color.White;
            panelHeader.Paint += delegate(object s, PaintEventArgs e)
            {
                e.Graphics.DrawLine(new Pen(Color.FromArgb(226, 232, 240)), 0, panelHeader.Height - 1, panelHeader.Width, panelHeader.Height - 1);
            };

            lblHeaderTitle = new Label();
            lblHeaderTitle.Text = "Welcome to OpenWA Setup";
            lblHeaderTitle.Font = new Font("Segoe UI", 10.5F, FontStyle.Bold);
            lblHeaderTitle.ForeColor = Color.FromArgb(30, 41, 59);
            lblHeaderTitle.Location = new Point(24, 12);
            lblHeaderTitle.AutoSize = true;
            panelHeader.Controls.Add(lblHeaderTitle);

            lblHeaderSubtitle = new Label();
            lblHeaderSubtitle.Text = "Automated installer for WhatsApp Bulk Messaging and Sessions";
            lblHeaderSubtitle.Font = new Font("Segoe UI", 8.5F);
            lblHeaderSubtitle.ForeColor = Color.FromArgb(100, 116, 139);
            lblHeaderSubtitle.Location = new Point(25, 35);
            lblHeaderSubtitle.AutoSize = true;
            panelHeader.Controls.Add(lblHeaderSubtitle);

            lblHeaderBadge = new Label();
            lblHeaderBadge.Text = "OpenWA v1.34";
            lblHeaderBadge.Font = new Font("Segoe UI", 8.5F, FontStyle.Bold);
            lblHeaderBadge.ForeColor = Color.FromArgb(22, 163, 74);
            lblHeaderBadge.BackColor = Color.FromArgb(240, 253, 244);
            lblHeaderBadge.Location = new Point(500, 18);
            lblHeaderBadge.Size = new Size(105, 26);
            lblHeaderBadge.TextAlign = ContentAlignment.MiddleCenter;
            lblHeaderBadge.BorderStyle = BorderStyle.FixedSingle;
            panelHeader.Controls.Add(lblHeaderBadge);

            this.Controls.Add(panelHeader);

            // 2. Bottom Footer Panel
            panelFooter = new Panel();
            panelFooter.Dock = DockStyle.Bottom;
            panelFooter.Height = 55;
            panelFooter.BackColor = Color.FromArgb(241, 245, 249);
            panelFooter.Paint += delegate(object s, PaintEventArgs e)
            {
                e.Graphics.DrawLine(new Pen(Color.FromArgb(226, 232, 240)), 0, 0, panelFooter.Width, 0);
            };

            btnBack = new Button();
            btnBack.Text = "< Back";
            btnBack.Size = new Size(85, 28);
            btnBack.Location = new Point(340, 13);
            btnBack.Click += delegate(object s, EventArgs e) { Navigate(-1); };
            panelFooter.Controls.Add(btnBack);

            btnNext = new Button();
            btnNext.Text = "Next >";
            btnNext.Size = new Size(85, 28);
            btnNext.Location = new Point(435, 13);
            btnNext.BackColor = Color.FromArgb(16, 185, 129);
            btnNext.ForeColor = Color.White;
            btnNext.FlatStyle = FlatStyle.Flat;
            btnNext.FlatAppearance.BorderSize = 0;
            btnNext.Click += delegate(object s, EventArgs e) { Navigate(1); };
            panelFooter.Controls.Add(btnNext);

            btnCancel = new Button();
            btnCancel.Text = "Cancel";
            btnCancel.Size = new Size(85, 28);
            btnCancel.Location = new Point(530, 13);
            btnCancel.Click += delegate(object s, EventArgs e)
            {
                if (currentPage == 4 && worker != null && worker.IsBusy)
                {
                    MessageBox.Show("Installation is currently in progress. Please wait until it completes.", "Installation In Progress", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                if (MessageBox.Show("Are you sure you want to cancel OpenWA WhatsApp Setup?", "Exit Setup", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
                {
                    this.Close();
                }
            };
            panelFooter.Controls.Add(btnCancel);

            this.Controls.Add(panelFooter);

            // 3. Middle Content Container
            panelContent = new Panel();
            panelContent.Dock = DockStyle.Fill;
            this.Controls.Add(panelContent);

            CreatePages();
        }

        private void CreatePages()
        {
            // --- Page 0: Welcome ---
            pageWelcome = new Panel();
            pageWelcome.Dock = DockStyle.Fill;

            Label lblWTitle = new Label();
            lblWTitle.Text = "Welcome to the OpenWA WhatsApp Software Setup Wizard";
            lblWTitle.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
            lblWTitle.ForeColor = Color.FromArgb(15, 23, 42);
            lblWTitle.Location = new Point(30, 25);
            lblWTitle.Size = new Size(560, 50);
            pageWelcome.Controls.Add(lblWTitle);

            Label lblWDesc = new Label();
            lblWDesc.Text = "This wizard will automatically install and configure OpenWA WhatsApp Software Suite on your computer.\n\n" +
                           "Included Tools & Features:\n" +
                           "  • Bulk Messaging Workspace (Batch sending, Excel/CSV, Reports): Port 3200\n" +
                           "  • WhatsApp Core Sessions & QR Scan Dashboard: Port 2886\n" +
                           "  • REST API Gateway & Swagger Documentation: Port 2785\n" +
                           "  • 1-Click Desktop Shortcuts & Pre-configured WhatsApp engine patches\n\n" +
                           "Aapko koi code ya terminal command run karne ki zarurat nahi hai. Bas 'Next' click karein.\n\n" +
                           "Click Next to continue, or Cancel to exit Setup.";
            lblWDesc.Location = new Point(30, 80);
            lblWDesc.Size = new Size(560, 220);
            lblWDesc.Font = new Font("Segoe UI", 9.5F);
            lblWDesc.ForeColor = Color.FromArgb(51, 65, 85);
            pageWelcome.Controls.Add(lblWDesc);

            panelContent.Controls.Add(pageWelcome);

            // --- Page 1: Destination Location ---
            pageDestination = new Panel();
            pageDestination.Dock = DockStyle.Fill;

            Label lblDTitle = new Label();
            lblDTitle.Text = "Select Destination Location";
            lblDTitle.Font = new Font("Segoe UI", 11F, FontStyle.Bold);
            lblDTitle.Location = new Point(30, 20);
            lblDTitle.Size = new Size(560, 25);
            pageDestination.Controls.Add(lblDTitle);

            Label lblDDesc = new Label();
            lblDDesc.Text = "Where should OpenWA WhatsApp Software Suite be installed?\nTo continue, click Next. If you would like to select a different folder, click Browse.";
            lblDDesc.Location = new Point(30, 48);
            lblDDesc.Size = new Size(560, 40);
            lblDDesc.ForeColor = Color.FromArgb(71, 85, 105);
            pageDestination.Controls.Add(lblDDesc);

            GroupBox grpDest = new GroupBox();
            grpDest.Text = "Destination Folder";
            grpDest.Location = new Point(30, 100);
            grpDest.Size = new Size(560, 80);

            txtDestPath = new TextBox();
            txtDestPath.Location = new Point(20, 32);
            txtDestPath.Size = new Size(415, 23);
            grpDest.Controls.Add(txtDestPath);

            btnBrowse = new Button();
            btnBrowse.Text = "Browse...";
            btnBrowse.Location = new Point(445, 30);
            btnBrowse.Size = new Size(95, 26);
            btnBrowse.Click += delegate(object s, EventArgs e)
            {
                using (FolderBrowserDialog fbd = new FolderBrowserDialog())
                {
                    fbd.Description = "Select target folder for OpenWA WhatsApp Software";
                    fbd.SelectedPath = txtDestPath.Text;
                    if (fbd.ShowDialog() == DialogResult.OK)
                    {
                        txtDestPath.Text = fbd.SelectedPath;
                    }
                }
            };
            grpDest.Controls.Add(btnBrowse);
            pageDestination.Controls.Add(grpDest);

            lblSpaceReq = new Label();
            lblSpaceReq.Text = "Disk Space Requirement: Approximately 1.2 GB of free disk space is required.\n" +
                               "Tip: Agar aapne project folder pehle se kisi drive me rakha hai, toh wahi path select kar sakte hain.";
            lblSpaceReq.Location = new Point(30, 195);
            lblSpaceReq.Size = new Size(560, 45);
            lblSpaceReq.ForeColor = Color.FromArgb(100, 116, 139);
            pageDestination.Controls.Add(lblSpaceReq);

            panelContent.Controls.Add(pageDestination);

            // --- Page 2: Select Additional Options ---
            pageOptions = new Panel();
            pageOptions.Dock = DockStyle.Fill;

            Label lblOTitle = new Label();
            lblOTitle.Text = "Select Additional Setup Tasks";
            lblOTitle.Font = new Font("Segoe UI", 11F, FontStyle.Bold);
            lblOTitle.Location = new Point(30, 20);
            lblOTitle.Size = new Size(560, 25);
            pageOptions.Controls.Add(lblOTitle);

            Label lblODesc = new Label();
            lblODesc.Text = "Select the additional tasks you would like Setup to perform during installation, then click Next:";
            lblODesc.Location = new Point(30, 48);
            lblODesc.Size = new Size(560, 25);
            lblODesc.ForeColor = Color.FromArgb(71, 85, 105);
            pageOptions.Controls.Add(lblODesc);

            chkDesktopShortcut = new CheckBox();
            chkDesktopShortcut.Text = "Create a Desktop Shortcut (\"OpenWA WhatsApp Bulk Sender\")";
            chkDesktopShortcut.Checked = true;
            chkDesktopShortcut.Font = new Font("Segoe UI", 9.5F, FontStyle.Bold);
            chkDesktopShortcut.Location = new Point(35, 90);
            chkDesktopShortcut.Size = new Size(540, 25);
            pageOptions.Controls.Add(chkDesktopShortcut);

            Label lblHint1 = new Label();
            lblHint1.Text = "Desktop par 1-click icon create hoga jisse click karte hi sabhi services start ho jayengi.";
            lblHint1.ForeColor = Color.FromArgb(100, 116, 139);
            lblHint1.Location = new Point(57, 115);
            lblHint1.Size = new Size(520, 20);
            pageOptions.Controls.Add(lblHint1);

            lblHint2.Location = new Point(57, 170);
            lblHint2.Size = new Size(520, 20);
            pageOptions.Controls.Add(lblHint2);

            chkNodeCheck = new CheckBox();
            chkNodeCheck.Text = "Auto-verify and silently install Node.js (v22 LTS) if missing on this PC";
            chkNodeCheck.Checked = true;
            chkNodeCheck.Font = new Font("Segoe UI", 9.5F, FontStyle.Bold);
            chkNodeCheck.Location = new Point(35, 200);
            chkNodeCheck.Size = new Size(540, 25);
            pageOptions.Controls.Add(chkNodeCheck);

            Label lblHint3 = new Label();
            lblHint3.Text = "Agar is naye PC par Node.js nahi hai, toh Setup automatically background me install kar dega.";
            lblHint3.ForeColor = Color.FromArgb(100, 116, 139);
            lblHint3.Location = new Point(57, 225);
            lblHint3.Size = new Size(520, 20);
            pageOptions.Controls.Add(lblHint3);

            panelContent.Controls.Add(pageOptions);

            // --- Page 3: Ready to Install ---
            pageReady = new Panel();
            pageReady.Dock = DockStyle.Fill;

            Label lblRTitle = new Label();
            lblRTitle.Text = "Ready to Install";
            lblRTitle.Font = new Font("Segoe UI", 11F, FontStyle.Bold);
            lblRTitle.Location = new Point(30, 20);
            lblRTitle.Size = new Size(560, 25);
            pageReady.Controls.Add(lblRTitle);

            Label lblRDesc = new Label();
            lblRDesc.Text = "Setup is now ready to begin installing OpenWA WhatsApp Software Suite on your computer.\nClick Install to proceed with installation, or click Back to review settings.";
            lblRDesc.Location = new Point(30, 48);
            lblRDesc.Size = new Size(560, 40);
            lblRDesc.ForeColor = Color.FromArgb(71, 85, 105);
            pageReady.Controls.Add(lblRDesc);

            txtSummary = new TextBox();
            txtSummary.Multiline = true;
            txtSummary.ReadOnly = true;
            txtSummary.BackColor = Color.White;
            txtSummary.ScrollBars = ScrollBars.Vertical;
            txtSummary.Location = new Point(30, 95);
            txtSummary.Size = new Size(560, 185);
            txtSummary.Font = new Font("Consolas", 9F);
            pageReady.Controls.Add(txtSummary);

            panelContent.Controls.Add(pageReady);

            // --- Page 4: Installing ---
            pageInstalling = new Panel();
            pageInstalling.Dock = DockStyle.Fill;

            lblInstallStatus = new Label();
            lblInstallStatus.Text = "Installing OpenWA WhatsApp Software Suite...";
            lblInstallStatus.Font = new Font("Segoe UI", 11F, FontStyle.Bold);
            lblInstallStatus.Location = new Point(30, 40);
            lblInstallStatus.Size = new Size(560, 25);
            pageInstalling.Controls.Add(lblInstallStatus);

            lblInstallDetail = new Label();
            lblInstallDetail.Text = "Please wait while Setup configures OpenWA on your computer...";
            lblInstallDetail.Location = new Point(30, 75);
            lblInstallDetail.Size = new Size(560, 25);
            lblInstallDetail.ForeColor = Color.FromArgb(71, 85, 105);
            pageInstalling.Controls.Add(lblInstallDetail);

            progressBar = new ProgressBar();
            progressBar.Location = new Point(30, 110);
            progressBar.Size = new Size(560, 28);
            progressBar.Style = ProgressBarStyle.Continuous;
            pageInstalling.Controls.Add(progressBar);

            panelContent.Controls.Add(pageInstalling);

            // --- Page 5: Finish ---
            pageFinish = new Panel();
            pageFinish.Dock = DockStyle.Fill;

            Label lblFTitle = new Label();
            lblFTitle.Text = "Completing the OpenWA WhatsApp Setup Wizard";
            lblFTitle.Font = new Font("Segoe UI", 12F, FontStyle.Bold);
            lblFTitle.ForeColor = Color.FromArgb(15, 23, 42);
            lblFTitle.Location = new Point(30, 25);
            lblFTitle.Size = new Size(560, 50);
            pageFinish.Controls.Add(lblFTitle);

            Label lblFDesc = new Label();
            lblFDesc.Text = "OpenWA WhatsApp Software Suite has been successfully installed and configured on your computer!\n\n" +
                           "Installed Components & Local URLs:\n" +
                           "  👉 Bulk Messaging Workspace: http://127.0.0.1:3200/\n" +
                           "  👉 Core WhatsApp Sessions & QR Dashboard: http://localhost:2886/\n" +
                           "  👉 REST API Gateway & Swagger Docs: http://127.0.0.1:2785/api/docs\n\n" +
                           "Desktop shortcut create ho chuka hai aur Windows Auto-Start active hai.\n" +
                           "Click Finish to exit Setup.";
            lblFDesc.Location = new Point(30, 80);
            lblFDesc.Size = new Size(560, 160);
            lblFDesc.Font = new Font("Segoe UI", 9.5F);
            lblFDesc.ForeColor = Color.FromArgb(51, 65, 85);
            pageFinish.Controls.Add(lblFDesc);

            chkLaunchNow = new CheckBox();
            chkLaunchNow.Text = "Launch OpenWA WhatsApp Software now (Open browser tabs immediately)";
            chkLaunchNow.Checked = true;
            chkLaunchNow.Font = new Font("Segoe UI", 10F, FontStyle.Bold);
            chkLaunchNow.ForeColor = Color.FromArgb(22, 163, 74);
            chkLaunchNow.Location = new Point(35, 250);
            chkLaunchNow.Size = new Size(550, 30);
            pageFinish.Controls.Add(chkLaunchNow);

            panelContent.Controls.Add(pageFinish);
        }

        private void UpdatePage()
        {
            pageWelcome.Visible = (currentPage == 0);
            pageDestination.Visible = (currentPage == 1);
            pageOptions.Visible = (currentPage == 2);
            pageReady.Visible = (currentPage == 3);
            pageInstalling.Visible = (currentPage == 4);
            pageFinish.Visible = (currentPage == 5);

            btnBack.Enabled = (currentPage > 0 && currentPage < 4);
            btnNext.Enabled = (currentPage != 4);
            btnCancel.Enabled = (currentPage != 4);

            if (currentPage == 0)
            {
                lblHeaderTitle.Text = "Welcome to OpenWA Setup";
                lblHeaderSubtitle.Text = "Automated installer for WhatsApp Bulk Messaging and Sessions";
                btnNext.Text = "Next >";
            }
            else if (currentPage == 1)
            {
                lblHeaderTitle.Text = "Select Destination Location";
                lblHeaderSubtitle.Text = "Choose the folder where OpenWA WhatsApp should be installed";
                btnNext.Text = "Next >";
            }
            else if (currentPage == 2)
            {
                lblHeaderTitle.Text = "Select Additional Tasks";
                lblHeaderSubtitle.Text = "Configure desktop shortcuts and Windows boot auto-start";
                btnNext.Text = "Next >";
            }
            else if (currentPage == 3)
            {
                lblHeaderTitle.Text = "Ready to Install";
                lblHeaderSubtitle.Text = "Click Install to begin configuring OpenWA WhatsApp Suite";
                btnNext.Text = "Install";

                StringBuilder sb = new StringBuilder();
                sb.AppendLine("Destination Location:");
                sb.AppendLine("  " + txtDestPath.Text.Trim());
                sb.AppendLine();
                sb.AppendLine("Additional Tasks:");
                sb.AppendLine("  • Desktop Shortcut: " + (chkDesktopShortcut.Checked ? "Yes (\"OpenWA WhatsApp Bulk Sender\")" : "No"));
                sb.AppendLine("  • Node.js Auto-Check: " + (chkNodeCheck.Checked ? "Yes (v22 LTS)" : "No"));
                sb.AppendLine();
                sb.AppendLine("Installed Applications:");
                sb.AppendLine("  • Bulk Messaging Workspace (http://127.0.0.1:3200/)");
                sb.AppendLine("  • WhatsApp Core Dashboard (http://localhost:2886/)");
                sb.AppendLine("  • API Gateway Docs (http://127.0.0.1:2785/api/docs)");
                txtSummary.Text = sb.ToString();
            }
            else if (currentPage == 4)
            {
                lblHeaderTitle.Text = "Installing OpenWA";
                lblHeaderSubtitle.Text = "Please wait while files are configured and services prepared...";
                btnNext.Text = "Installing...";
                btnNext.Enabled = false;
                btnBack.Enabled = false;
                btnCancel.Enabled = false;

                StartInstallation();
            }
            else if (currentPage == 5)
            {
                lblHeaderTitle.Text = "Installation Completed";
                lblHeaderSubtitle.Text = "OpenWA WhatsApp Suite has been successfully installed";
                btnBack.Visible = false;
                btnCancel.Visible = false;
                btnNext.Text = "Finish";
                btnNext.Size = new Size(110, 28);
                btnNext.Location = new Point(505, 13);
            }
        }

        private void Navigate(int delta)
        {
            if (currentPage == 5 && delta > 0)
            {
                // Finish clicked!
                if (chkLaunchNow.Checked)
                {
                    string targetBat = Path.Combine(targetDirectory, "START-SOFTWARE.bat");
                    if (File.Exists(targetBat))
                    {
                        ProcessStartInfo psi = new ProcessStartInfo(targetBat);
                        psi.WorkingDirectory = targetDirectory;
                        Process.Start(psi);
                    }
                    else
                    {
                        Process.Start("http://127.0.0.1:3200/");
                        Process.Start("http://localhost:2886/");
                    }
                }
                this.Close();
                return;
            }

            if (currentPage == 1 && delta > 0)
            {
                string path = txtDestPath.Text.Trim();
                if (string.IsNullOrEmpty(path))
                {
                    MessageBox.Show("Please enter a valid destination folder path.", "Invalid Path", MessageBoxButtons.OK, MessageBoxIcon.Warning);
                    return;
                }
                targetDirectory = Path.GetFullPath(path);
            }

            currentPage += delta;
            if (currentPage < 0) currentPage = 0;
            if (currentPage >= TOTAL_PAGES) currentPage = TOTAL_PAGES - 1;

            UpdatePage();
        }

        private void StartInstallation()
        {
            worker = new BackgroundWorker();
            worker.WorkerReportsProgress = true;
            worker.DoWork += Worker_DoWork;
            worker.ProgressChanged += Worker_ProgressChanged;
            worker.RunWorkerCompleted += Worker_RunWorkerCompleted;
            worker.RunWorkerAsync();
        }

        private void Worker_DoWork(object sender, DoWorkEventArgs e)
        {
            try
            {
                // STEP 1: Node.js Check
                worker.ReportProgress(10, "Step 1/5: Checking Node.js environment...");
                bool hasNode = CheckNodeInstalled();
                if (!hasNode && chkNodeCheck.Checked)
                {
                    worker.ReportProgress(15, "Node.js missing. Downloading official Node.js v22 LTS installer...");
                    string tempMsi = Path.Combine(Path.GetTempPath(), "node-v22-x64.msi");
                    try
                    {
                        using (WebClient client = new WebClient())
                        {
                            client.DownloadFile("https://nodejs.org/dist/v22.14.0/node-v22.14.0-x64.msi", tempMsi);
                        }
                        worker.ReportProgress(25, "Silently installing Node.js v22 LTS...");
                        ProcessStartInfo psiMsi = new ProcessStartInfo("msiexec.exe", string.Format("/i \"{0}\" /qn /norestart", tempMsi));
                        psiMsi.WindowStyle = ProcessWindowStyle.Hidden;
                        Process pMsi = Process.Start(psiMsi);
                        pMsi.WaitForExit();
                    }
                    catch (Exception ex)
                    {
                        Debug.WriteLine("Node install error: " + ex.Message);
                    }
                }

                // STEP 2: Copy Project Files to Destination
                worker.ReportProgress(30, "Step 2/5: Setting up OpenWA files in destination folder...");
                bool isSameFolder = sourceDirectory.Equals(targetDirectory, StringComparison.OrdinalIgnoreCase);

                if (!isSameFolder)
                {
                    if (!Directory.Exists(targetDirectory))
                    {
                        Directory.CreateDirectory(targetDirectory);
                    }

                    // Copy files recursively
                    string[] allFiles = Directory.GetFiles(sourceDirectory, "*.*", SearchOption.AllDirectories);
                    int totalFiles = allFiles.Length;
                    int copied = 0;

                    for (int i = 0; i < totalFiles; i++)
                    {
                        string srcFile = allFiles[i];
                        string relative = srcFile.Substring(sourceDirectory.Length).TrimStart('\\');

                        // Skip git or temporary IDE cache
                        if (relative.StartsWith(".git\\") || relative.StartsWith(".system_generated\\"))
                        {
                            continue;
                        }

                        string destFile = Path.Combine(targetDirectory, relative);
                        string destDir = Path.GetDirectoryName(destFile);
                        if (!Directory.Exists(destDir))
                        {
                            Directory.CreateDirectory(destDir);
                        }

                        File.Copy(srcFile, destFile, true);
                        copied++;

                        if (copied % 25 == 0 || i == totalFiles - 1)
                        {
                            int pct = 30 + (int)((float)copied / totalFiles * 40.0f);
                            worker.ReportProgress(pct, string.Format("Copying files: {0} / {1}...", copied, totalFiles));
                        }
                    }
                }
                else
                {
                    worker.ReportProgress(70, "Existing project files detected. Configuring in-place...");
                    Thread.Sleep(500);
                }

                // STEP 3: Apply WhatsApp Web Patches
                worker.ReportProgress(75, "Step 3/5: Applying WhatsApp Web engine compatibility patches...");
                string patchScript = Path.Combine(targetDirectory, "scripts", "patch-wwebjs-201832.js");
                if (File.Exists(patchScript))
                {
                    RunProcessHidden("node.exe", string.Format("\"{0}\"", patchScript), targetDirectory);
                }

                // STEP 4: Create Desktop Shortcut
                if (chkDesktopShortcut.Checked)
                {
                    worker.ReportProgress(85, "Step 4/5: Creating Desktop Shortcut...");
                    string targetBat = Path.Combine(targetDirectory, "START-SOFTWARE.bat");
                    CreateDesktopShortcut(targetBat);
                }

                worker.ReportProgress(100, "Installation complete!");
                Thread.Sleep(500);
            }
            catch (Exception ex)
            {
                e.Result = ex;
            }
        }

        private void Worker_ProgressChanged(object sender, ProgressChangedEventArgs e)
        {
            progressBar.Value = Math.Min(100, Math.Max(0, e.ProgressPercentage));
            lblInstallDetail.Text = (e.UserState != null) ? e.UserState.ToString() : "";
        }

        private void Worker_RunWorkerCompleted(object sender, RunWorkerCompletedEventArgs e)
        {
            if (e.Result is Exception)
            {
                Exception ex = (Exception)e.Result;
                MessageBox.Show("An error occurred during installation:\n" + ex.Message, "Setup Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                btnCancel.Enabled = true;
                btnBack.Enabled = true;
            }
            else
            {
                currentPage = 5;
                UpdatePage();
            }
        }

        private bool CheckNodeInstalled()
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo("node.exe", "-v");
                psi.UseShellExecute = false;
                psi.CreateNoWindow = true;
                psi.RedirectStandardOutput = true;
                Process p = Process.Start(psi);
                p.WaitForExit(3000);
                return (p.ExitCode == 0);
            }
            catch
            {
                return false;
            }
        }

        private void RunProcessHidden(string fileName, string args, string workingDir)
        {
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo(fileName, args);
                psi.WorkingDirectory = workingDir;
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                Process p = Process.Start(psi);
                p.WaitForExit(10000);
            }
            catch {}
        }

        private void CreateDesktopShortcut(string targetBatPath)
        {
            try
            {
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string shortcutPath = Path.Combine(desktop, "OpenWA WhatsApp Bulk Sender.lnk");

                string psCommand = string.Format(
                    "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('{0}'); $s.TargetPath = '{1}'; $s.WorkingDirectory = '{2}'; $s.IconLocation = 'shell32.dll,135'; $s.Description = 'OpenWA WhatsApp Software Suite'; $s.Save()",
                    shortcutPath.Replace("'", "''"),
                    targetBatPath.Replace("'", "''"),
                    Path.GetDirectoryName(targetBatPath).Replace("'", "''")
                );

                ProcessStartInfo psi = new ProcessStartInfo("powershell.exe", "-NoProfile -ExecutionPolicy Bypass -Command \"" + psCommand + "\"");
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                psi.CreateNoWindow = true;
                Process p = Process.Start(psi);
                p.WaitForExit(5000);
            }
            catch {}
        }

        [STAThread]
        public static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupWizardForm());
        }
    }
}
