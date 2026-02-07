# 解决“git 不是内部或外部命令”

说明：系统找不到 `git`，要么是**没装 Git**，要么是**装了但没加入 PATH**。按下面任选一种方式处理。

---

## 方式一：安装 Git（推荐，一步步做）

### 1. 下载 Git

1. 打开**浏览器**，地址栏输入：  
   **https://git-scm.com/download/win**  
   回车。
2. 页面会自动开始下载（文件名类似 `Git-2.43.0-64-bit.exe`）。  
   若没自动下载，就点页面上的 **“Click here to download”** 或 **“Download for Windows”**。

### 2. 安装 Git

1. 打开**“下载”文件夹**（或浏览器默认保存位置），找到刚下的 **Git-xxx-64-bit.exe**，**双击**运行。
2. 若弹出“是否允许此应用更改设备？”→ 点 **“是”**。
3. 安装向导里：
   - 第一页：直接点 **Next**。
   - **Select Components**：默认即可，点 **Next**。
   - **Choosing the default editor**：默认即可，点 **Next**。
   - **Adjusting your PATH environment**：  
     选 **“Git from the command line and also from 3rd-party software”**（第二项），再点 **Next**。  
     （这样以后在 cmd 里就能直接用 `git` 命令。）
   - 后面一路 **Next**，最后点 **Install**，等进度条走完，点 **Finish**。

### 3. 重新打开命令提示符再试

1. **关掉**当前那个黑色的“命令提示符”窗口（点右上角 ×）。
2. 重新打开一个新的命令提示符：  
   - 按 **Win + R**，输入 **cmd**，回车；  
   或  
   - 按 **Win** 键，在搜索框输入 **cmd**，回车。
3. 在新窗口里输入：  
   **cd /d C:\Users\cz\Desktop\2026_2_7**  
   回车，先进入你的项目文件夹。
4. 再输入：  
   **git --version**  
   回车。  
   - 若出现类似 `git version 2.43.0.windows.1`，说明已经可用。
5. 然后按 DEPLOY.md 里第 3 步，从 **git init** 开始依次执行即可。

---

## 方式二：已经装过 Git，但 cmd 里找不到

有时 Git 装在了非默认路径，或安装时没勾选“加入 PATH”，可以按下面检查。

### 1. 确认 Git 装在哪里

1. 打开**文件资源管理器**（Win + E）。
2. 在地址栏输入：  
   **C:\Program Files\Git\cmd**  
   回车。
3. 看是否存在 **git.exe**：  
   - **存在**：记下路径是 `C:\Program Files\Git\cmd`，继续下面“把 Git 加入 PATH”。  
   - **不存在**：再试 **C:\Program Files (x86)\Git\cmd**，或按 **Win** 键搜 **git**，在结果里右键 **git.exe** → **打开文件所在位置**，看上面地址栏的路径（一般是 …\Git\cmd）。

### 2. 把 Git 加入 PATH（让 cmd 能找到 git）

1. 按 **Win** 键，输入 **环境变量**，点 **“编辑系统环境变量”**。
2. 在“系统属性”窗口里点 **“环境变量”**。
3. 在 **“用户变量”** 或 **“系统变量”** 里找到 **Path**，选中后点 **“编辑”**。
4. 点 **“新建”**，输入：  
   **C:\Program Files\Git\cmd**  
   （若你查到的路径不是这个，就填你记下的那个路径，最后要能点到 **git.exe** 所在文件夹）。
5. 点 **“确定”** 把几个窗口都关掉。
6. **关掉所有已打开的 cmd 窗口**，再新开一个 cmd，输入：  
   **git --version**  
   能显示版本号就说明 PATH 已生效。然后再在项目目录执行 **git init** 等命令。

---

## 小结

- 报错 **“git 不是内部或外部命令”** = 当前环境里没有可用的 `git`。
- **先按方式一**：从 https://git-scm.com/download/win 下载并安装，安装时选 **“Git from the command line and also from 3rd-party software”**，装完后**关掉 cmd 再新开一个**，在项目目录里执行 **git --version** 和 **git init**。
- 若你确定以前装过 Git，再按**方式二**检查路径并加入 PATH。
