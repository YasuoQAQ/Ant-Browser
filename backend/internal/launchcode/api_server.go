package launchcode

import (
	"ant-chrome/backend/internal/browser"
	"ant-chrome/backend/internal/logger"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// ============================================================================
// 完整 REST API 服务 — 支持通过 HTTP 管理浏览器实例
// ============================================================================

// ProfileCreator 创建实例接口
type ProfileCreator interface {
	CreateProfile(input browser.ProfileInput) (*browser.Profile, error)
	UpdateProfile(profileId string, input browser.ProfileInput) (*browser.Profile, error)
	DeleteProfile(profileId string) error
	ListProfiles() []browser.Profile
	GetProfile(profileId string) (*browser.Profile, error)
}

// CookieManager CDP Cookie 管理接口
type CookieManager interface {
	GetCookies(profileId string, urls []string) ([]map[string]interface{}, error)
	SetCookies(profileId string, cookies []map[string]interface{}) error
	ClearCookies(profileId string) error
}

// APIServer 完整 REST API 服务
type APIServer struct {
	launchServer   *LaunchServer
	profileCreator ProfileCreator
	cookieMgr      CookieManager
	browserMgr     *browser.Manager
	starter        BrowserStarter
	port           int
	server         *http.Server
	mu             sync.Mutex
}

// NewAPIServer 创建 API 服务
func NewAPIServer(ls *LaunchServer, pc ProfileCreator, cm CookieManager, mgr *browser.Manager, starter BrowserStarter, port int) *APIServer {
	return &APIServer{
		launchServer:   ls,
		profileCreator: pc,
		cookieMgr:      cm,
		browserMgr:     mgr,
		starter:        starter,
		port:           port,
	}
}

// Start 启动 API 服务
func (s *APIServer) Start() error {
	mux := http.NewServeMux()

	// 健康检查
	mux.HandleFunc("/api/health", s.handleHealth)

	// Profile CRUD
	mux.HandleFunc("/api/profiles", s.handleProfiles)
	mux.HandleFunc("/api/profiles/", s.handleProfileByID)

	// 实例启停
	mux.HandleFunc("/api/instances/start", s.handleInstanceStart)
	mux.HandleFunc("/api/instances/refresh", s.handleInstanceRefresh)
	mux.HandleFunc("/api/instances/stop", s.handleInstanceStop)
	mux.HandleFunc("/api/instances/status", s.handleInstanceStatus)

	// Cookie 管理
	mux.HandleFunc("/api/cookies/get", s.handleCookiesGet)
	mux.HandleFunc("/api/cookies/set", s.handleCookiesSet)
	mux.HandleFunc("/api/cookies/clear", s.handleCookiesClear)

	// 批量操作
	mux.HandleFunc("/api/batch/create", s.handleBatchCreate)

	// 保留原有 launch API 兼容
	mux.HandleFunc("/api/launch", s.launchServer.handleLaunchWithBody)
	mux.HandleFunc("/api/launch/logs", s.launchServer.handleLaunchLogs)
	mux.HandleFunc("/api/launch/", s.launchServer.handleLaunch)

	handler := localhostOnly(mux)

	ln, port, _, err := bindLaunchListener(s.port)
	if err != nil {
		return err
	}

	s.mu.Lock()
	s.port = port
	s.server = &http.Server{Handler: handler}
	s.mu.Unlock()

	log := logger.New("APIServer")
	log.Info("API Server 已启动", logger.F("port", port))

	go func() {
		if serveErr := s.server.Serve(ln); serveErr != nil && serveErr != http.ErrServerClosed {
			log.Error("API Server 异常退出", logger.F("error", serveErr.Error()))
		}
	}()

	return nil
}

// Stop 优雅关闭
func (s *APIServer) Stop() error {
	s.mu.Lock()
	srv := s.server
	s.mu.Unlock()
	if srv == nil {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return srv.Shutdown(ctx)
}

// Port 返回实际端口
func (s *APIServer) Port() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.port
}

// GetInfo 返回 API Server 当前监听信息
func (s *APIServer) GetInfo() map[string]interface{} {
	preferredPort := 0
	if s.port > 0 {
		preferredPort = s.port
	}
	actualPort := s.Port()
	info := map[string]interface{}{
		"host":          "127.0.0.1",
		"preferredPort": preferredPort,
		"port":          actualPort,
		"ready":         actualPort > 0,
	}
	if actualPort > 0 {
		info["baseUrl"] = fmt.Sprintf("http://127.0.0.1:%d", actualPort)
	} else {
		info["baseUrl"] = ""
	}
	return info
}

// ============================================================================
// 路由处理
// ============================================================================

func (s *APIServer) handleHealth(w http.ResponseWriter, r *http.Request) {
	apiJSON(w, 200, map[string]interface{}{"ok": true, "service": "ant-browser-api"})
}

// POST /api/profiles — 创建
// GET  /api/profiles — 列表
func (s *APIServer) handleProfiles(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		profiles := s.profileCreator.ListProfiles()
		apiJSON(w, 200, map[string]interface{}{"ok": true, "profiles": profiles, "total": len(profiles)})

	case http.MethodPost:
		var input browser.ProfileInput
		if !decodeBody(w, r, &input) {
			return
		}
		profile, err := s.profileCreator.CreateProfile(input)
		if err != nil {
			apiJSON(w, 500, map[string]interface{}{"ok": false, "error": err.Error()})
			return
		}
		apiJSON(w, 201, map[string]interface{}{"ok": true, "profile": profile})

	default:
		apiJSON(w, 405, map[string]interface{}{"ok": false, "error": "method not allowed"})
	}
}

// GET    /api/profiles/{id} — 详情
// PUT    /api/profiles/{id} — 更新
// DELETE /api/profiles/{id} — 删除
func (s *APIServer) handleProfileByID(w http.ResponseWriter, r *http.Request) {
	profileId := strings.TrimPrefix(r.URL.Path, "/api/profiles/")
	profileId = strings.TrimSpace(profileId)
	if profileId == "" {
		// 没有 ID，转发到列表处理
		s.handleProfiles(w, r)
		return
	}

	switch r.Method {
	case http.MethodGet:
		profile, err := s.profileCreator.GetProfile(profileId)
		if err != nil {
			apiJSON(w, 404, map[string]interface{}{"ok": false, "error": err.Error()})
			return
		}
		apiJSON(w, 200, map[string]interface{}{"ok": true, "profile": profile})

	case http.MethodPut:
		var input browser.ProfileInput
		if !decodeBody(w, r, &input) {
			return
		}
		profile, err := s.profileCreator.UpdateProfile(profileId, input)
		if err != nil {
			apiJSON(w, 500, map[string]interface{}{"ok": false, "error": err.Error()})
			return
		}
		apiJSON(w, 200, map[string]interface{}{"ok": true, "profile": profile})

	case http.MethodDelete:
		if err := s.profileCreator.DeleteProfile(profileId); err != nil {
			apiJSON(w, 500, map[string]interface{}{"ok": false, "error": err.Error()})
			return
		}
		apiJSON(w, 200, map[string]interface{}{"ok": true})

	default:
		apiJSON(w, 405, map[string]interface{}{"ok": false, "error": "method not allowed"})
	}
}

// POST /api/instances/start
// body: { "profileId": "xxx", "proxyConfig": "ipfoxy://...", "launchArgs": [...], "startUrls": [...] }
func (s *APIServer) handleInstanceStart(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		apiJSON(w, 405, map[string]interface{}{"ok": false, "error": "method not allowed"})
		return
	}

	var req struct {
		ProfileID            string   `json:"profileId"`
		ProxyConfig          string   `json:"proxyConfig"`
		LaunchArgs           []string `json:"launchArgs"`
		StartURLs            []string `json:"startUrls"`
		SkipDefaultStartURLs bool     `json:"skipDefaultStartUrls"`
		ResetUserData        bool     `json:"resetUserData"`
	}
	if !decodeBody(w, r, &req) {
		return
	}
	if req.ProfileID == "" {
		apiJSON(w, 400, map[string]interface{}{"ok": false, "error": "profileId is required"})
		return
	}

	// 如果传了 proxyConfig，先临时更新 profile 的代理配置
	if strings.TrimSpace(req.ProxyConfig) != "" {
		s.browserMgr.Mutex.Lock()
		if profile, exists := s.browserMgr.Profiles[req.ProfileID]; exists {
			profile.ProxyConfig = strings.TrimSpace(req.ProxyConfig)
			profile.ProxyId = "" // 清除 proxyId，使用直接配置
		}
		s.browserMgr.Mutex.Unlock()
	}

	var profile *browser.Profile
	var err error

	if starterWithParams, ok := s.starter.(BrowserStarterWithParams); ok && (len(req.LaunchArgs) > 0 || len(req.StartURLs) > 0 || req.SkipDefaultStartURLs || req.ResetUserData) {
		params := LaunchRequestParams{
			LaunchArgs:           req.LaunchArgs,
			StartURLs:            req.StartURLs,
			SkipDefaultStartURLs: req.SkipDefaultStartURLs,
			ResetUserData:        req.ResetUserData,
		}
		profile, err = starterWithParams.StartInstanceWithParams(req.ProfileID, params)
	} else {
		profile, err = s.starter.StartInstance(req.ProfileID)
	}

	if err != nil {
		apiJSON(w, 500, map[string]interface{}{"ok": false, "error": err.Error()})
		return
	}

	response := s.buildInstanceResponse(profile, req.LaunchArgs, req.ResetUserData, req.StartURLs, req.SkipDefaultStartURLs)
	apiJSON(w, 200, response)
}

func (s *APIServer) handleInstanceRefresh(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		apiJSON(w, 405, map[string]interface{}{"ok": false, "error": "method not allowed"})
		return
	}

	var req struct {
		ProfileID            string    `json:"profileId"`
		ProfileName          string    `json:"profileName"`
		UserDataDir          string    `json:"userDataDir"`
		CoreID               string    `json:"coreId"`
		FingerprintArgs      []string  `json:"fingerprintArgs"`
		ProxyID              string    `json:"proxyId"`
		ProxyConfig          string    `json:"proxyConfig"`
		LaunchArgs           []string  `json:"launchArgs"`
		Tags                 []string  `json:"tags"`
		Keywords             []string  `json:"keywords"`
		GroupID              string    `json:"groupId"`
		StartURLs            []string  `json:"startUrls"`
		SkipDefaultStartURLs bool      `json:"skipDefaultStartUrls"`
		ResetUserData        *bool     `json:"resetUserData"`
		StartAfterRefresh    *bool     `json:"startAfterRefresh"`
	}
	if !decodeBody(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.ProfileID) == "" {
		apiJSON(w, 400, map[string]interface{}{"ok": false, "error": "profileId is required"})
		return
	}

	profile, err := s.profileCreator.GetProfile(req.ProfileID)
	if err != nil {
		apiJSON(w, 404, map[string]interface{}{"ok": false, "error": err.Error()})
		return
	}

	if profile.Running {
		stopper, ok := s.starter.(interface{ StopInstance(profileId string) (*browser.Profile, error) })
		if !ok {
			apiJSON(w, 500, map[string]interface{}{"ok": false, "error": "stop not supported"})
			return
		}
		if _, err := stopper.StopInstance(req.ProfileID); err != nil {
			apiJSON(w, 500, map[string]interface{}{"ok": false, "error": err.Error()})
			return
		}
		profile, err = s.profileCreator.GetProfile(req.ProfileID)
		if err != nil {
			apiJSON(w, 404, map[string]interface{}{"ok": false, "error": err.Error()})
			return
		}
	}

	input := browser.ProfileInput{
		ProfileName:     profile.ProfileName,
		UserDataDir:     profile.UserDataDir,
		CoreId:          profile.CoreId,
		FingerprintArgs: append([]string{}, profile.FingerprintArgs...),
		ProxyId:         profile.ProxyId,
		ProxyConfig:     profile.ProxyConfig,
		LaunchArgs:      append([]string{}, profile.LaunchArgs...),
		Tags:            append([]string{}, profile.Tags...),
		Keywords:        append([]string{}, profile.Keywords...),
		GroupId:         profile.GroupId,
	}

	if strings.TrimSpace(req.ProfileName) != "" {
		input.ProfileName = strings.TrimSpace(req.ProfileName)
	}
	if strings.TrimSpace(req.UserDataDir) != "" {
		input.UserDataDir = strings.TrimSpace(req.UserDataDir)
	}
	if strings.TrimSpace(req.CoreID) != "" {
		input.CoreId = strings.TrimSpace(req.CoreID)
	}
	if req.FingerprintArgs != nil {
		input.FingerprintArgs = append([]string{}, req.FingerprintArgs...)
	}
	if req.LaunchArgs != nil {
		input.LaunchArgs = append([]string{}, req.LaunchArgs...)
	}
	if req.Tags != nil {
		input.Tags = append([]string{}, req.Tags...)
	}
	if req.Keywords != nil {
		input.Keywords = append([]string{}, req.Keywords...)
	}
	if strings.TrimSpace(req.GroupID) != "" {
		input.GroupId = strings.TrimSpace(req.GroupID)
	}
	if strings.TrimSpace(req.ProxyID) != "" {
		input.ProxyId = strings.TrimSpace(req.ProxyID)
		input.ProxyConfig = ""
	} else if strings.TrimSpace(req.ProxyConfig) != "" {
		input.ProxyId = ""
		input.ProxyConfig = strings.TrimSpace(req.ProxyConfig)
	}

	updatedProfile, err := s.profileCreator.UpdateProfile(req.ProfileID, input)
	if err != nil {
		apiJSON(w, 500, map[string]interface{}{"ok": false, "error": err.Error()})
		return
	}

	resetUserData := true
	if req.ResetUserData != nil {
		resetUserData = *req.ResetUserData
	}
	startAfterRefresh := true
	if req.StartAfterRefresh != nil {
		startAfterRefresh = *req.StartAfterRefresh
	}
	if !startAfterRefresh {
		response := s.buildInstanceResponse(updatedProfile, req.LaunchArgs, resetUserData, req.StartURLs, req.SkipDefaultStartURLs)
		response["started"] = false
		response["refreshed"] = true
		apiJSON(w, 200, response)
		return
	}

	starterWithParams, ok := s.starter.(BrowserStarterWithParams)
	if !ok {
		apiJSON(w, 500, map[string]interface{}{"ok": false, "error": "start with params not supported"})
		return
	}
	params := LaunchRequestParams{
		StartURLs:            req.StartURLs,
		SkipDefaultStartURLs: req.SkipDefaultStartURLs,
		ResetUserData:        resetUserData,
	}
	startedProfile, err := starterWithParams.StartInstanceWithParams(req.ProfileID, params)
	if err != nil {
		apiJSON(w, 500, map[string]interface{}{"ok": false, "error": err.Error()})
		return
	}

	response := s.buildInstanceResponse(startedProfile, req.LaunchArgs, resetUserData, req.StartURLs, req.SkipDefaultStartURLs)
	response["started"] = true
	response["refreshed"] = true
	apiJSON(w, 200, response)
}

// POST /api/instances/stop
func (s *APIServer) handleInstanceStop(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		apiJSON(w, 405, map[string]interface{}{"ok": false, "error": "method not allowed"})
		return
	}

	var req struct {
		ProfileID string `json:"profileId"`
	}
	if !decodeBody(w, r, &req) {
		return
	}
	if req.ProfileID == "" {
		apiJSON(w, 400, map[string]interface{}{"ok": false, "error": "profileId is required"})
		return
	}

	// 通过 browserMgr 停止
	s.browserMgr.Mutex.Lock()
	profile, exists := s.browserMgr.Profiles[req.ProfileID]
	s.browserMgr.Mutex.Unlock()

	if !exists {
		apiJSON(w, 404, map[string]interface{}{"ok": false, "error": "profile not found"})
		return
	}

	if !profile.Running {
		apiJSON(w, 200, map[string]interface{}{"ok": true, "message": "already stopped"})
		return
	}

	// 调用 App 层的 stop（通过实现了 StopInstance 的 starter）
	if stopper, ok := s.starter.(interface{ StopInstance(profileId string) (*browser.Profile, error) }); ok {
		if _, err := stopper.StopInstance(req.ProfileID); err != nil {
			apiJSON(w, 500, map[string]interface{}{"ok": false, "error": err.Error()})
			return
		}
	} else {
		apiJSON(w, 500, map[string]interface{}{"ok": false, "error": "stop not supported"})
		return
	}

	apiJSON(w, 200, map[string]interface{}{"ok": true})
}

// GET /api/instances/status?profileId=xxx
func (s *APIServer) handleInstanceStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		apiJSON(w, 405, map[string]interface{}{"ok": false, "error": "method not allowed"})
		return
	}

	profileId := r.URL.Query().Get("profileId")

	if profileId != "" {
		// 单个实例状态
		s.browserMgr.Mutex.Lock()
		profile, exists := s.browserMgr.Profiles[profileId]
		s.browserMgr.Mutex.Unlock()
		if !exists {
			apiJSON(w, 404, map[string]interface{}{"ok": false, "error": "profile not found"})
			return
		}
		apiJSON(w, 200, map[string]interface{}{
			"ok":        true,
			"profileId": profile.ProfileId,
			"running":   profile.Running,
			"pid":       profile.Pid,
			"debugPort": profile.DebugPort,
			"lastError": profile.LastError,
		})
		return
	}

	// 所有实例状态
	s.browserMgr.Mutex.Lock()
	instances := make([]map[string]interface{}, 0, len(s.browserMgr.Profiles))
	for _, p := range s.browserMgr.Profiles {
		instances = append(instances, map[string]interface{}{
			"profileId":   p.ProfileId,
			"profileName": p.ProfileName,
			"running":     p.Running,
			"pid":         p.Pid,
			"debugPort":   p.DebugPort,
		})
	}
	s.browserMgr.Mutex.Unlock()

	apiJSON(w, 200, map[string]interface{}{"ok": true, "instances": instances, "total": len(instances)})
}

// POST /api/cookies/get
// body: { "profileId": "xxx", "urls": ["https://..."] }
func (s *APIServer) handleCookiesGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		apiJSON(w, 405, map[string]interface{}{"ok": false, "error": "method not allowed"})
		return
	}
	if s.cookieMgr == nil {
		apiJSON(w, 501, map[string]interface{}{"ok": false, "error": "cookie manager not available"})
		return
	}

	var req struct {
		ProfileID string   `json:"profileId"`
		URLs      []string `json:"urls"`
	}
	if !decodeBody(w, r, &req) {
		return
	}

	cookies, err := s.cookieMgr.GetCookies(req.ProfileID, req.URLs)
	if err != nil {
		apiJSON(w, 500, map[string]interface{}{"ok": false, "error": err.Error()})
		return
	}
	apiJSON(w, 200, map[string]interface{}{"ok": true, "cookies": cookies})
}

// POST /api/cookies/set
// body: { "profileId": "xxx", "cookies": [...] }
func (s *APIServer) handleCookiesSet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		apiJSON(w, 405, map[string]interface{}{"ok": false, "error": "method not allowed"})
		return
	}
	if s.cookieMgr == nil {
		apiJSON(w, 501, map[string]interface{}{"ok": false, "error": "cookie manager not available"})
		return
	}

	var req struct {
		ProfileID string                   `json:"profileId"`
		Cookies   []map[string]interface{} `json:"cookies"`
	}
	if !decodeBody(w, r, &req) {
		return
	}

	if err := s.cookieMgr.SetCookies(req.ProfileID, req.Cookies); err != nil {
		apiJSON(w, 500, map[string]interface{}{"ok": false, "error": err.Error()})
		return
	}
	apiJSON(w, 200, map[string]interface{}{"ok": true})
}

// POST /api/cookies/clear
// body: { "profileId": "xxx" }
func (s *APIServer) handleCookiesClear(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		apiJSON(w, 405, map[string]interface{}{"ok": false, "error": "method not allowed"})
		return
	}
	if s.cookieMgr == nil {
		apiJSON(w, 501, map[string]interface{}{"ok": false, "error": "cookie manager not available"})
		return
	}

	var req struct {
		ProfileID string `json:"profileId"`
	}
	if !decodeBody(w, r, &req) {
		return
	}

	if err := s.cookieMgr.ClearCookies(req.ProfileID); err != nil {
		apiJSON(w, 500, map[string]interface{}{"ok": false, "error": err.Error()})
		return
	}
	apiJSON(w, 200, map[string]interface{}{"ok": true})
}

// POST /api/batch/create
// body: { "profiles": [ { profileInput... }, ... ] }
func (s *APIServer) handleBatchCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		apiJSON(w, 405, map[string]interface{}{"ok": false, "error": "method not allowed"})
		return
	}

	var req struct {
		Profiles []browser.ProfileInput `json:"profiles"`
	}
	if !decodeBody(w, r, &req) {
		return
	}

	created := make([]*browser.Profile, 0, len(req.Profiles))
	failed := make([]map[string]interface{}, 0)

	for idx, input := range req.Profiles {
		profile, err := s.profileCreator.CreateProfile(input)
		if err != nil {
			failed = append(failed, map[string]interface{}{
				"index": idx,
				"error": err.Error(),
			})
			continue
		}
		created = append(created, profile)
	}

	apiJSON(w, 200, map[string]interface{}{
		"ok":      len(failed) == 0,
		"created": created,
		"failed":  failed,
		"total":   len(req.Profiles),
	})
}

func (s *APIServer) buildInstanceResponse(profile *browser.Profile, requestedLaunchArgs []string, resetUserData bool, requestedStartURLs []string, skipDefaultStartURLs bool) map[string]interface{} {
	profileCopy := *profile
	effectiveProxy := s.resolveEffectiveProxy(&profileCopy)
	wsEndpoint := ""
	if profile.DebugPort > 0 {
		wsEndpoint = firstWebSocketDebuggerURL(profile.DebugPort)
	}

	runtimeSummary := browser.RuntimeSummary{
		EffectiveProxy:      effectiveProxy,
		RequestedLaunchArgs: append([]string{}, requestedLaunchArgs...),
		RequestedStartUrls:  append([]string{}, requestedStartURLs...),
		WSEndpoint:          wsEndpoint,
		ResetUserData:       resetUserData,
		LastStartAt:         profile.LastStartAt,
		LastStopAt:          profile.LastStopAt,
		LastError:           profile.LastError,
		DebugPort:           profile.DebugPort,
		Pid:                 profile.Pid,
		Running:             profile.Running,
	}

	response := map[string]interface{}{
		"ok":                   true,
		"profileId":            profile.ProfileId,
		"pid":                  profile.Pid,
		"debugPort":            profile.DebugPort,
		"running":              profile.Running,
		"profile":              profile,
		"runtime":              runtimeSummary,
		"userDataDir":          profile.UserDataDir,
		"proxyId":              profile.ProxyId,
		"proxyConfig":          profile.ProxyConfig,
		"effectiveProxy":       effectiveProxy,
		"fingerprintArgs":      append([]string{}, profile.FingerprintArgs...),
		"launchArgs":           append([]string{}, profile.LaunchArgs...),
		"requestedLaunchArgs":  append([]string{}, requestedLaunchArgs...),
		"requestedStartUrls":   append([]string{}, requestedStartURLs...),
		"skipDefaultStartUrls": skipDefaultStartURLs,
		"resetUserData":        resetUserData,
		"lastStartAt":          profile.LastStartAt,
		"lastStopAt":           profile.LastStopAt,
		"lastError":            profile.LastError,
	}
	if wsEndpoint != "" {
		response["wsEndpoint"] = wsEndpoint
	}
	return response
}

func (s *APIServer) resolveEffectiveProxy(profile *browser.Profile) string {
	resolvedProxyConfig := strings.TrimSpace(profile.ProxyConfig)
	if profile.ProxyId != "" {
		for _, item := range s.browserMgr.Config.Browser.Proxies {
			if strings.EqualFold(item.ProxyId, profile.ProxyId) {
				resolvedProxyConfig = strings.TrimSpace(item.ProxyConfig)
				break
			}
		}
	}
	return resolvedProxyConfig
}

func firstWebSocketDebuggerURL(debugPort int) string {
	resp, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/json", debugPort))
	if err != nil {
		return ""
	}
	defer resp.Body.Close()

	var targets []struct {
		Type                 string `json:"type"`
		WebSocketDebuggerURL string `json:"webSocketDebuggerUrl"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&targets); err != nil {
		return ""
	}

	for _, target := range targets {
		if target.Type == "page" && target.WebSocketDebuggerURL != "" {
			return target.WebSocketDebuggerURL
		}
	}
	for _, target := range targets {
		if target.WebSocketDebuggerURL != "" {
			return target.WebSocketDebuggerURL
		}
	}
	return ""
}

// ============================================================================
// 工具函数
// ============================================================================

func decodeBody(w http.ResponseWriter, r *http.Request, dst interface{}) bool {
	defer r.Body.Close()
	data, err := io.ReadAll(io.LimitReader(r.Body, 2<<20))
	if err != nil {
		apiJSON(w, 400, map[string]interface{}{"ok": false, "error": "read body failed"})
		return false
	}
	if err := json.Unmarshal(data, dst); err != nil {
		apiJSON(w, 400, map[string]interface{}{"ok": false, "error": "invalid json"})
		return false
	}
	return true
}

func apiJSON(w http.ResponseWriter, code int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(payload)
}

func localhostOnly(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			host = r.RemoteAddr
		}
		ip := net.ParseIP(strings.TrimSpace(host))
		if ip == nil || !ip.IsLoopback() {
			apiJSON(w, http.StatusForbidden, map[string]interface{}{"ok": false, "error": "forbidden"})
			return
		}
		next.ServeHTTP(w, r)
	})
}
