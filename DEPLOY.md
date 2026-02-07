# 部署到 GitHub 并生成网站（GitHub Pages）

## 一、运行网站（本地预览）

本项目使用 ES Module，需要用 **本地 HTTP 服务器** 打开，不能直接双击 `index.html`。

任选一种方式：

- **Node.js**：在项目文件夹打开终端，执行  
  `npx serve`  
  然后浏览器访问：http://localhost:3000
- **Python**：在项目文件夹打开终端，执行  
  `python -m http.server 8080`  
  然后访问：http://localhost:8080

---

## 二、上传到 GitHub 并发布为网站

---

### 第 1 步：安装 Git（如果还没装过）

1. **打开浏览器**（Chrome、Edge 等都可以）。
2. **在地址栏输入**：`https://git-scm.com/download/win`，按回车。
3. 页面会自动开始下载 **Git for Windows** 安装包（如没自动下载，点页面上的 “Click here to download”）。
4. 下载完成后，**双击**下载好的安装文件（一般在“下载”文件夹里，名字类似 `Git-2.xx.x-64-bit.exe`）。
5. 安装过程里一路点 **Next** 即可（默认选项不用改），最后点 **Finish**。
6. **关掉**所有已打开的“命令提示符”或“PowerShell”窗口，再重新打开一个（这样系统才能识别到 Git）。  
   - 怎么打开：按键盘 **Win + R**，输入 `cmd` 回车，或按 **Win** 键搜“命令提示符”或“PowerShell”打开。
7. 在新打开的窗口里输入：`git --version`，按回车。  
   - 若出现类似 `git version 2.xx.x` 就说明安装成功；若提示“不是内部或外部命令”，说明 Git 没装好或需要重启电脑后再试。

---

### 第 2 步：在 GitHub 上新建一个仓库

1. **打开浏览器**，在地址栏输入：`https://github.com`，按回车。
2. 若未登录：点页面右上角 **Sign in**，用你的 GitHub 账号登录；若已登录，会直接看到首页。
3. 点页面**右上角**的 **“+”** 号（加号按钮）。
4. 在下拉菜单里点 **“New repository”**（新建仓库）。
5. 进入新建仓库页面后：
   - **Repository name**（仓库名）：输入英文，例如 `jingdezhen-pottery`（不能有空格，建议小写）。
   - **Description**：可留空，或随便写一句介绍。
   - **Public**：选中 **Public**（公开）。
   - 下面 **不要**勾选 “Add a README file”。
   - 其他选项保持默认即可。
6. 点击页面最下面绿色的 **“Create repository”** 按钮。
7. 创建成功后，你会看到新仓库的页面，**记住页面顶部显示的地址**，格式类似：  
   `https://github.com/你的用户名/你的仓库名`  
   例如：`https://github.com/zhangsan/jingdezhen-pottery`。  
   后面第 3 步里会用到“你的用户名”和“你的仓库名”。

---

### 第 3 步：在本机用 Git 把项目传上去

#### 3.1 打开“命令窗口”并进到项目文件夹

任选一种方式，让黑色/蓝色窗口的“当前目录”就是你的项目文件夹 `2026_2_7`：

**方式 A（推荐）**

1. 打开 **文件资源管理器**（按 **Win + E**）。
2. 左侧点 **“桌面”**，再双击进入 **“2026_2_7”** 文件夹（确保里面能看到 `index.html`、`style.css`、`script.js`）。
3. 在窗口**顶部的地址栏**里用鼠标点一下（让地址栏里的路径被选中）。
4. 在地址栏里输入：`cmd`，然后按 **回车**。  
   - 会弹出一个**命令提示符**窗口，并且当前目录已经是 `C:\Users\你的电脑名\Desktop\2026_2_7`。

**方式 B**

1. 按 **Win** 键，在搜索框输入 **cmd** 或 **命令提示符**，回车打开“命令提示符”。
2. 在窗口里输入下面这一行（把路径换成你电脑上 `2026_2_7` 的实际位置），按回车：  
   `cd /d C:\Users\cz\Desktop\2026_2_7`  
   - 若你的项目不在桌面，就把 `C:\Users\cz\Desktop\2026_2_7` 改成你实际路径，例如 `D:\我的项目\2026_2_7`。

确认窗口里当前路径是项目文件夹后，再往下做。

#### 3.2 在窗口里一条一条输入下面命令（每输完一条就按回车）

**第 1 条命令：**

```
git init
```

- 作用：把当前文件夹变成 Git 仓库。  
- 正常会提示：`Initialized empty Git repository in ...`

**第 2 条命令：**

```
git add .
```

- 作用：把当前文件夹里**所有**要提交的文件加入列表（包括 `index.html`、`style.css`、`script.js`、`README.md`、`.gitignore`、`DEPLOY.md` 等）。  
- 一般不会有提示，直接到下一行就对了。  
- 若你只想加部分文件，可以用下面这一句代替（注意 `.gitignore` 要加引号，避免 Windows 下出错）：  
  `git add index.html style.css script.js README.md DEPLOY.md ".gitignore"`

**第 3 条命令：**

```
git commit -m "指尖非遗：景德镇制瓷 网页版"
```

- 作用：把刚才 add 的文件打成一次提交。  
- 正常会提示类似：`x files changed, xxx insertions(+)`

**第 4 条命令：**

```
git branch -M main
```

- 作用：把默认分支改名为 main（GitHub 现在默认用 main）。  
- 一般无输出。

**第 5 条命令（需要改成你自己的地址）：**

```
git remote add origin https://github.com/你的用户名/你的仓库名.git
```

- **必须把 `你的用户名` 和 `你的仓库名` 换成你在第 2 步创建仓库时用的**。  
- 例如仓库地址是 `https://github.com/zhangsan/jingdezhen-pottery`，就写成：  
  `git remote add origin https://github.com/zhangsan/jingdezhen-pottery.git`  
- 输完按回车。若提示 “remote origin already exists”，说明已经加过了，可忽略或先执行 `git remote remove origin` 再重新执行这一句。

**第 6 条命令：**

```
git push -u origin main
```

- 作用：把本地的 main 分支推送到 GitHub，第一次推送会要你登录。  
- **可能出现的提示：**
  - 弹出**浏览器**或**登录窗口**：按提示用 GitHub 账号登录或授权即可。
  - 若提示 “Support for password authentication was removed”：说明不能用密码，需要用 **Personal Access Token**。  
    - 打开：GitHub 网站 → 右上角头像 → **Settings** → 左侧最下面 **Developer settings** → **Personal access tokens** → **Tokens (classic)** → **Generate new token**，勾选 **repo**，生成后复制那一串字符，在提示输入密码时把这段 Token 粘贴进去当“密码”用。
  - 推送成功后，会看到类似：`Branch 'main' set up to track remote branch 'main' from 'origin'.`

到这里，代码就已经上传到 GitHub 了。下一步是让 GitHub 把你的仓库发布成网站。

---

### 第 4 步：开启 GitHub Pages（生成可访问的网站）

1. **打开浏览器**，进入**你自己的那个仓库页面**（就是第 2 步创建完后的页面，或地址栏输入 `https://github.com/你的用户名/你的仓库名`）。
2. 在仓库页面**顶部**有一排标签：**Code**、**Issues**、**Pull requests**、**Actions**、**…**，点 **“Settings”**（设置）。  
   - 若没看到 Settings：确认是你自己的仓库（不是别人的），只有仓库主能看到 Settings。
3. 进入 Settings 后，看**左侧一竖排菜单**，往下滚，找到 **“Pages”**，用鼠标点一下 **“Pages”**。
4. 在 **“Build and deployment”** 这一块：
   - **Source**（来源）：点下拉框，选 **“Deploy from a branch”**（从分支部署）。
   - 下面会出现 **Branch** 和 **Folder**：
     - **Branch**：选 **main**（或 master，看你第 3 步用的是什么）。
     - **Folder**：选 **/ (root)**（根目录）。
   - 选完后点右边的 **“Save”** 按钮。
5. 保存后，页面会刷新，上面会有一行蓝色或绿色的提示，类似：  
   **“Your site is live at https://你的用户名.github.io/你的仓库名/”**  
   这就是你的网站地址。
6. 刚保存后可能显示 “Building” 或还没出现地址，**等 1～2 分钟**，再刷新一下 Settings → Pages 页面，直到出现 “Your site is live at …”。
7. **复制**那个地址（例如 `https://zhangsan.github.io/jingdezhen-pottery/`），在浏览器新标签页里**粘贴并打开**，就能看到“指尖非遗：景德镇制瓷”的网页了。

以后你只要改完代码后，在项目文件夹里打开命令窗口，执行：

```
git add .
git commit -m "更新说明"
git push
```

推送成功后，等一两分钟再刷新你的 `https://你的用户名.github.io/你的仓库名/` 页面，就会看到更新后的网站。

---

## 之后若修改了代码

在项目文件夹执行：

```bash
git add .
git commit -m "更新说明"
git push
```

推送后 GitHub Pages 会自动更新，稍等片刻刷新网站即可。
