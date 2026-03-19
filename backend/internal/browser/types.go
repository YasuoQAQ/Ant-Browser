package browser

import (
	"ant-chrome/backend/internal/config"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
)

// FingerprintConfig 结构化指纹配置（与前端 FingerprintConfig 完全对齐）
type FingerprintConfig struct {
	Seed                string   `json:"seed,omitempty"`
	Brand               string   `json:"brand,omitempty"`
	BrandVersion        string   `json:"brandVersion,omitempty"`
	Platform            string   `json:"platform,omitempty"`
	PlatformVersion     string   `json:"platformVersion,omitempty"`
	Lang                string   `json:"lang,omitempty"`
	AcceptLang          string   `json:"acceptLang,omitempty"`
	Timezone            string   `json:"timezone,omitempty"`
	Resolution          string   `json:"resolution,omitempty"`
	CustomResolution    string   `json:"customResolution,omitempty"`
	HardwareConcurrency string   `json:"hardwareConcurrency,omitempty"`
	DisableWebrtcUDP    bool     `json:"disableWebrtcUdp,omitempty"`
	SpoofCanvas         *bool    `json:"spoofCanvas,omitempty"`
	SpoofAudio          *bool    `json:"spoofAudio,omitempty"`
	SpoofFont           *bool    `json:"spoofFont,omitempty"`
	SpoofClientRects    *bool    `json:"spoofClientRects,omitempty"`
	SpoofGPU            *bool    `json:"spoofGpu,omitempty"`
	UnknownArgs         []string `json:"unknownArgs,omitempty"`
}

// ProfilePreferences 浏览器偏好设置（启动前行为与安全检查）
type ProfilePreferences struct {
	// 显示
	ShowWindowName bool `json:"showWindowName"`
	// 书签
	CustomBookmarks bool `json:"customBookmarks"`
	// 同步选项
	SyncBookmarks      bool `json:"syncBookmarks"`
	SyncHistory        bool `json:"syncHistory"`
	SyncTabs           bool `json:"syncTabs"`
	SyncCookies        bool `json:"syncCookies"`
	SyncExtensions     bool `json:"syncExtensions"`
	SyncPasswords      bool `json:"syncPasswords"`
	SyncIndexedDB      bool `json:"syncIndexedDB"`
	SyncLocalStorage   bool `json:"syncLocalStorage"`
	SyncSessionStorage bool `json:"syncSessionStorage"`
	// 启动前清理
	ClearCacheOnStart        bool `json:"clearCacheOnStart"`
	ClearCookiesOnStart      bool `json:"clearCookiesOnStart"`
	ClearLocalStorageOnStart bool `json:"clearLocalStorageOnStart"`
	// 指纹行为
	RandomFingerprintOnStart bool `json:"randomFingerprintOnStart"`
	// 浏览器行为
	DisablePasswordPrompt bool `json:"disablePasswordPrompt"`
	// 安全检查
	StopOnNetworkFail bool `json:"stopOnNetworkFail"`
	StopOnIPChange    bool `json:"stopOnIPChange"`
}

// RuntimeSummary 最近一次启动/运行摘要
// 说明：保留顶层字段用于兼容，新的读取方应优先使用 Runtime。
type RuntimeSummary struct {
	EffectiveProxy      string   `json:"effectiveProxy,omitempty"`
	RequestedLaunchArgs []string `json:"requestedLaunchArgs,omitempty"`
	RequestedStartUrls  []string `json:"requestedStartUrls,omitempty"`
	WSEndpoint          string   `json:"wsEndpoint,omitempty"`
	ResetUserData       bool     `json:"resetUserData,omitempty"`
	LastStartAt         string   `json:"lastStartAt,omitempty"`
	LastStopAt          string   `json:"lastStopAt,omitempty"`
	LastError           string   `json:"lastError,omitempty"`
	DebugPort           int      `json:"debugPort,omitempty"`
	Pid                 int      `json:"pid,omitempty"`
	Running             bool     `json:"running"`
}

// Profile 浏览器配置文件
type Profile struct {
	ProfileId         string             `json:"profileId"`
	ProfileName       string             `json:"profileName"`
	UserDataDir       string             `json:"userDataDir"`
	CoreId            string             `json:"coreId"`
	FingerprintArgs   []string           `json:"fingerprintArgs"`
	FingerprintConfig *FingerprintConfig `json:"fingerprintConfig,omitempty"`
	ProxyId           string             `json:"proxyId"`
	ProxyConfig     string   `json:"proxyConfig"`
	LaunchArgs      []string `json:"launchArgs"`
	Tags            []string `json:"tags"`
	Keywords        []string `json:"keywords"`
	GroupId         string   `json:"groupId"` // 所属分组ID
	Preferences     *ProfilePreferences `json:"preferences,omitempty"`
	LaunchCode      string   `json:"launchCode"`
	Running         bool     `json:"running"`
	DebugPort       int      `json:"debugPort"`
	Pid             int      `json:"pid"`
	LastError       string   `json:"lastError"`
	CreatedAt       string   `json:"createdAt"`
	UpdatedAt       string   `json:"updatedAt"`
	LastStartAt     string   `json:"lastStartAt"`
	LastStopAt      string   `json:"lastStopAt"`
	Runtime         RuntimeSummary `json:"runtime,omitempty"`
	EffectiveProxy      string   `json:"effectiveProxy,omitempty"`
	RequestedLaunchArgs []string `json:"requestedLaunchArgs,omitempty"`
	RequestedStartUrls  []string `json:"requestedStartUrls,omitempty"`
	WSEndpoint          string   `json:"wsEndpoint,omitempty"`
	ResetUserData       bool     `json:"resetUserData,omitempty"`
}

// ProfileInput 创建/更新配置文件的输入
type ProfileInput struct {
	ProfileName     string   `json:"profileName"`
	UserDataDir     string   `json:"userDataDir"`
	CoreId          string   `json:"coreId"`
	FingerprintArgs []string `json:"fingerprintArgs"`
	ProxyId         string   `json:"proxyId"`
	ProxyConfig     string   `json:"proxyConfig"`
	LaunchArgs      []string `json:"launchArgs"`
	Tags            []string `json:"tags"`
	Keywords        []string `json:"keywords"`
	GroupId         string   `json:"groupId"` // 所属分组ID
	Preferences     *ProfilePreferences `json:"preferences,omitempty"`
}

// Tab 浏览器标签页
type Tab struct {
	TabId  string `json:"tabId"`
	Title  string `json:"title"`
	Url    string `json:"url"`
	Active bool   `json:"active"`
}

// Settings 浏览器全局设置
type Settings struct {
	UserDataRoot           string   `json:"userDataRoot"`
	DefaultFingerprintArgs []string `json:"defaultFingerprintArgs"`
	DefaultLaunchArgs      []string `json:"defaultLaunchArgs"`
	DefaultProxy           string   `json:"defaultProxy"`
}

// CoreInput 内核配置输入
type CoreInput struct {
	CoreId    string `json:"coreId"`
	CoreName  string `json:"coreName"`
	CorePath  string `json:"corePath"`
	IsDefault bool   `json:"isDefault"`
}

// CoreValidateResult 内核路径验证结果
type CoreValidateResult struct {
	Valid   bool   `json:"valid"`
	Message string `json:"message"`
}

// CoreExtendedInfo 内核扩展信息
type CoreExtendedInfo struct {
	CoreId        string `json:"coreId"`
	ChromeVersion string `json:"chromeVersion"`
	InstanceCount int    `json:"instanceCount"`
}

// Group 实例分组
type Group struct {
	GroupId   string `json:"groupId"`
	GroupName string `json:"groupName"`
	ParentId  string `json:"parentId"` // 空字符串表示根级分组
	SortOrder int    `json:"sortOrder"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

// GroupInput 创建/更新分组的输入
type GroupInput struct {
	GroupName string `json:"groupName"`
	ParentId  string `json:"parentId"`
	SortOrder int    `json:"sortOrder"`
}

// GroupWithCount 带实例计数的分组
type GroupWithCount struct {
	Group
	InstanceCount int `json:"instanceCount"`
}

// 类型别名
type Proxy = config.BrowserProxy
type Core = config.BrowserCore
type Environment = config.BrowserEnvironment
type ProfileConfig = config.BrowserProfileConfig

// CodeProvider 提供 LaunchCode 的接口（由 launchcode.LaunchCodeService 实现）
type CodeProvider interface {
	EnsureCode(profileId string) (string, error)
	Remove(profileId string) error
}

// Manager 浏览器管理器
type Manager struct {
	Config           *config.Config
	AppRoot          string // 应用根目录，所有相对路径基于此解析（生产=exe目录，dev=项目根目录）
	Profiles         map[string]*Profile
	Mutex            sync.Mutex
	BrowserProcesses map[string]*exec.Cmd
	XrayBridges      map[string]*XrayBridge
	CodeProvider     CodeProvider

	// DAO 层（注入后使用 SQLite 存储，未注入时降级到 config.yaml）
	ProfileDAO  ProfileDAO
	ProxyDAO    ProxyDAO
	CoreDAO     CoreDAO
	BookmarkDAO BookmarkDAO
	GroupDAO    GroupDAO
}

// XrayBridge Xray 桥接进程
type XrayBridge struct {
	NodeKey   string
	Port      int
	Cmd       *exec.Cmd
	Pid       int
	Running   bool
	LastError string
}

// NewManager 创建浏览器管理器
func NewManager(cfg *config.Config, appRoot string) *Manager {
	return &Manager{
		Config:           cfg,
		AppRoot:          appRoot,
		Profiles:         make(map[string]*Profile),
		BrowserProcesses: make(map[string]*exec.Cmd),
		XrayBridges:      make(map[string]*XrayBridge),
	}
}

// ResolveRelativePath 将相对路径解析为绝对路径（基于 AppRoot）。
// 如果传入的已经是绝对路径则直接返回。
func (m *Manager) ResolveRelativePath(p string) string {
	if filepath.IsAbs(p) {
		return p
	}
	if m.AppRoot != "" {
		return filepath.Join(m.AppRoot, p)
	}
	// 兜底：使用 CWD
	if cwd, err := os.Getwd(); err == nil {
		return filepath.Join(cwd, p)
	}
	return p
}
