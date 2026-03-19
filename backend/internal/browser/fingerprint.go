package browser

import (
	"fmt"
	"strings"
)

// CLI 参数前缀 → FingerprintConfig 字段映射（与前端 KEY_MAP 对齐）
var keyMap = map[string]string{
	"--fingerprint":                      "seed",
	"--fingerprint-brand":                "brand",
	"--fingerprint-brand-version":        "brandVersion",
	"--fingerprint-platform":             "platform",
	"--fingerprint-platform-version":     "platformVersion",
	"--lang":                             "lang",
	"--accept-lang":                      "acceptLang",
	"--timezone":                         "timezone",
	"--window-size":                      "resolution",
	"--fingerprint-hardware-concurrency": "hardwareConcurrency",
}

var presetResolutions = map[string]bool{
	"1920,1080": true, "1440,900": true, "1366,768": true,
	"2560,1440": true, "1280,800": true, "1600,900": true,
}

func boolPtr(v bool) *bool {
	return &v
}

// ParseFingerprintArgs 将 CLI 参数列表解析为结构化 FingerprintConfig
func ParseFingerprintArgs(args []string) *FingerprintConfig {
	cfg := &FingerprintConfig{
		DisableWebrtcUDP: false,
		SpoofCanvas:      boolPtr(true),
		SpoofAudio:       boolPtr(true),
		SpoofFont:        boolPtr(true),
		SpoofClientRects: boolPtr(true),
		SpoofGPU:         boolPtr(true),
	}
	for _, arg := range args {
		if arg == "--disable-non-proxied-udp" {
			cfg.DisableWebrtcUDP = true
			continue
		}

		eqIdx := strings.Index(arg, "=")
		if eqIdx == -1 {
			cfg.UnknownArgs = append(cfg.UnknownArgs, arg)
			continue
		}
		key := arg[:eqIdx]
		val := arg[eqIdx+1:]

		if key == "--disable-spoofing" {
			items := strings.Split(strings.ToLower(val), ",")
			for _, item := range items {
				switch strings.TrimSpace(item) {
				case "canvas":
					cfg.SpoofCanvas = boolPtr(false)
				case "audio":
					cfg.SpoofAudio = boolPtr(false)
				case "font":
					cfg.SpoofFont = boolPtr(false)
				case "clientrects":
					cfg.SpoofClientRects = boolPtr(false)
				case "gpu":
					cfg.SpoofGPU = boolPtr(false)
				}
			}
			continue
		}

		field, ok := keyMap[key]
		if !ok {
			cfg.UnknownArgs = append(cfg.UnknownArgs, arg)
			continue
		}
		switch field {
		case "seed":
			cfg.Seed = val
		case "brand":
			cfg.Brand = val
		case "brandVersion":
			cfg.BrandVersion = val
		case "platform":
			cfg.Platform = val
		case "platformVersion":
			cfg.PlatformVersion = val
		case "lang":
			cfg.Lang = val
		case "acceptLang":
			cfg.AcceptLang = val
		case "timezone":
			cfg.Timezone = val
		case "resolution":
			if presetResolutions[val] {
				cfg.Resolution = val
			} else {
				cfg.Resolution = "custom"
				cfg.CustomResolution = val
			}
		case "hardwareConcurrency":
			cfg.HardwareConcurrency = val
		}
	}
	return cfg
}

// SerializeFingerprintConfig 将结构化配置序列化为 CLI 参数列表
func SerializeFingerprintConfig(cfg *FingerprintConfig) []string {
	if cfg == nil {
		return nil
	}
	var args []string
	if cfg.Seed != "" {
		args = append(args, fmt.Sprintf("--fingerprint=%s", cfg.Seed))
	}
	if cfg.Brand != "" {
		args = append(args, fmt.Sprintf("--fingerprint-brand=%s", cfg.Brand))
	}
	if cfg.BrandVersion != "" {
		args = append(args, fmt.Sprintf("--fingerprint-brand-version=%s", cfg.BrandVersion))
	}
	if cfg.Platform != "" {
		args = append(args, fmt.Sprintf("--fingerprint-platform=%s", cfg.Platform))
	}
	if cfg.PlatformVersion != "" {
		args = append(args, fmt.Sprintf("--fingerprint-platform-version=%s", cfg.PlatformVersion))
	}
	if cfg.Lang != "" {
		args = append(args, fmt.Sprintf("--lang=%s", cfg.Lang))
	}
	if cfg.AcceptLang != "" {
		args = append(args, fmt.Sprintf("--accept-lang=%s", cfg.AcceptLang))
	}
	if cfg.Timezone != "" {
		args = append(args, fmt.Sprintf("--timezone=%s", cfg.Timezone))
	}
	res := cfg.Resolution
	if res == "custom" {
		res = cfg.CustomResolution
	}
	if res != "" {
		args = append(args, fmt.Sprintf("--window-size=%s", res))
	}
	if cfg.HardwareConcurrency != "" {
		args = append(args, fmt.Sprintf("--fingerprint-hardware-concurrency=%s", cfg.HardwareConcurrency))
	}
	if cfg.DisableWebrtcUDP {
		args = append(args, "--disable-non-proxied-udp")
	}

	var disabledSpoofing []string
	if cfg.SpoofCanvas != nil && !*cfg.SpoofCanvas {
		disabledSpoofing = append(disabledSpoofing, "canvas")
	}
	if cfg.SpoofAudio != nil && !*cfg.SpoofAudio {
		disabledSpoofing = append(disabledSpoofing, "audio")
	}
	if cfg.SpoofFont != nil && !*cfg.SpoofFont {
		disabledSpoofing = append(disabledSpoofing, "font")
	}
	if cfg.SpoofClientRects != nil && !*cfg.SpoofClientRects {
		disabledSpoofing = append(disabledSpoofing, "clientrects")
	}
	if cfg.SpoofGPU != nil && !*cfg.SpoofGPU {
		disabledSpoofing = append(disabledSpoofing, "gpu")
	}
	if len(disabledSpoofing) > 0 {
		args = append(args, fmt.Sprintf("--disable-spoofing=%s", strings.Join(disabledSpoofing, ",")))
	}

	args = append(args, cfg.UnknownArgs...)
	return args
}

// MigrateFingerprintArgs 如果 FingerprintConfig 为 nil 但 FingerprintArgs 非空，
// 自动从 FingerprintArgs 解析并填充 FingerprintConfig。
func MigrateFingerprintArgs(profile *Profile) {
	if profile.FingerprintConfig != nil {
		return
	}
	if len(profile.FingerprintArgs) == 0 {
		return
	}
	profile.FingerprintConfig = ParseFingerprintArgs(profile.FingerprintArgs)
}

// IsEmpty 判断 FingerprintConfig 是否为空（无有效配置项）
func (c *FingerprintConfig) IsEmpty() bool {
	if c == nil {
		return true
	}
	return c.Seed == "" && c.Brand == "" && c.BrandVersion == "" &&
		c.Platform == "" && c.PlatformVersion == "" &&
		c.Lang == "" && c.AcceptLang == "" && c.Timezone == "" &&
		c.Resolution == "" && c.CustomResolution == "" &&
		c.HardwareConcurrency == "" && !c.DisableWebrtcUDP &&
		(c.SpoofCanvas == nil || *c.SpoofCanvas) &&
		(c.SpoofAudio == nil || *c.SpoofAudio) &&
		(c.SpoofFont == nil || *c.SpoofFont) &&
		(c.SpoofClientRects == nil || *c.SpoofClientRects) &&
		(c.SpoofGPU == nil || *c.SpoofGPU) &&
		len(c.UnknownArgs) == 0
}
