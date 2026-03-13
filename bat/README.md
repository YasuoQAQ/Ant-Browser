# bat

## 用途

- `dev.bat`：本地开发启动
- `build.bat`：本地构建可执行文件
- `publish.bat`：打包发布安装包

## 用法

### `dev.bat`

适合日常开发。

```bat
bat\dev.bat
```

### `build.bat`

构建 `build\bin\ant-chrome.exe`。

```bat
bat\build.bat
```

### `publish.bat`

生成安装包，需要先安装 NSIS。

```bat
bat\publish.bat
```

产物：

```text
publish\output\AntBrowser-Setup-<version>.exe
```

## 备注

- `generate-bindings.bat` 是辅助脚本，通常由 `build.bat` 调用。
