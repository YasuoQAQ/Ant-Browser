package backend

import (
	"os"
	"path/filepath"
	"strings"
)

// appRootAbs 返回应用根目录的绝对路径，优先使用 App 注入的 appRoot。
func (a *App) appRootAbs() string {
	root := strings.TrimSpace(a.appRoot)
	if root == "" {
		if cwd, err := os.Getwd(); err == nil {
			root = cwd
		}
	}
	if root == "" {
		return ""
	}
	if abs, err := filepath.Abs(root); err == nil {
		return abs
	}
	return root
}

// appDataDir 返回 data 根目录绝对路径。
func (a *App) appDataDir() string {
	return a.resolveAppPath("data")
}

// appChromeDir 返回 chrome 根目录绝对路径。
func (a *App) appChromeDir() string {
	return a.resolveAppPath("chrome")
}
