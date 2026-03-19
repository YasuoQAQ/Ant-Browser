#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Ant Browser 自动化客户端 SDK
通过 REST API 管理浏览器窗口：创建、启动、停止、修改、删除

使用前请确保 Ant Browser 已启动，API Server 正在运行。

用法示例:
    client = AntBrowserClient(port=你的API端口)

    # 创建带 IPFoxy 代理的窗口
    profile = client.create_profile(
        name="账号1",
        proxy_config="ipfoxy://gate-sg.ipfoxy.io:58688:customer-xxx:password",
        fingerprint_args=["--fingerprint-brand=Chrome", "--fingerprint-platform=windows"],
    )

    # 启动窗口
    result = client.start(profile["profileId"])

    # 停止窗口
    client.stop(profile["profileId"])

    # 删除窗口
    client.delete(profile["profileId"])
"""

import requests
import time
import random


class AntBrowserClient:
    """Ant Browser REST API 客户端"""

    def __init__(self, host="127.0.0.1", port=None):
        """
        初始化客户端

        Args:
            host: API 服务地址，默认 127.0.0.1
            port: API 服务端口，如果不指定则自动探测
        """
        if port:
            self.base_url = f"http://{host}:{port}"
        else:
            # 自动探测端口（尝试常见端口范围）
            self.base_url = self._auto_detect(host)

    def _auto_detect(self, host):
        """自动探测 API Server 端口"""
        # 先尝试从 LaunchServer 获取信息
        for port in range(10000, 10100):
            try:
                resp = requests.get(f"http://{host}:{port}/api/health", timeout=1)
                data = resp.json()
                if data.get("ok") and data.get("service") == "ant-browser-api":
                    print(f"[OK] 发现 API Server: http://{host}:{port}")
                    return f"http://{host}:{port}"
            except:
                continue
        raise ConnectionError("无法自动发现 API Server，请手动指定端口")

    def _get(self, path, params=None):
        resp = requests.get(f"{self.base_url}{path}", params=params, timeout=30)
        return resp.json()

    def _post(self, path, data=None):
        resp = requests.post(f"{self.base_url}{path}", json=data, timeout=60)
        return resp.json()

    def _put(self, path, data=None):
        resp = requests.put(f"{self.base_url}{path}", json=data, timeout=30)
        return resp.json()

    def _delete(self, path):
        resp = requests.delete(f"{self.base_url}{path}", timeout=30)
        return resp.json()

    # ========================================================================
    # 健康检查
    # ========================================================================

    def health(self):
        """检查 API 服务是否正常"""
        return self._get("/api/health")

    # ========================================================================
    # Profile 管理（创建/列表/详情/修改/删除）
    # ========================================================================

    def create_profile(self, name="", proxy_config="", proxy_id="",
                       fingerprint_args=None, launch_args=None,
                       core_id="", tags=None, user_data_dir=""):
        """
        创建浏览器窗口配置

        Args:
            name: 窗口名称
            proxy_config: 代理配置，支持格式:
                - ipfoxy://host:port:username:password  (IPFoxy SOCKS5 认证代理)
                - socks5://host:port                    (SOCKS5 代理)
                - http://host:port                      (HTTP 代理)
                - direct://                             (直连)
                - vmess://...                           (V2Ray vmess)
            proxy_id: 代理池中的代理 ID（与 proxy_config 二选一）
            fingerprint_args: 指纹参数列表，如:
                ["--fingerprint-brand=Chrome", "--fingerprint-platform=windows",
                 "--fingerprint-hardware-concurrency=8", "--fingerprint-device-memory=16"]
            launch_args: 额外启动参数
            core_id: 内核 ID
            tags: 标签列表
            user_data_dir: 自定义用户数据目录

        Returns:
            dict: {"ok": True, "profile": {...}}
        """
        data = {
            "profileName": name or f"自动创建_{int(time.time())}",
            "proxyConfig": proxy_config,
            "proxyId": proxy_id,
            "fingerprintArgs": fingerprint_args or [],
            "launchArgs": launch_args or [],
            "coreId": core_id,
            "tags": tags or [],
            "userDataDir": user_data_dir,
        }
        result = self._post("/api/profiles", data)
        if not result.get("ok"):
            raise RuntimeError(f"创建失败: {result.get('error')}")
        return result["profile"]

    def list_profiles(self):
        """获取所有窗口配置列表"""
        result = self._get("/api/profiles")
        return result.get("profiles", [])

    def get_profile(self, profile_id):
        """获取单个窗口配置详情"""
        result = self._get(f"/api/profiles/{profile_id}")
        if not result.get("ok"):
            raise RuntimeError(f"获取失败: {result.get('error')}")
        return result["profile"]

    def update_profile(self, profile_id, **kwargs):
        """
        修改窗口配置

        Args:
            profile_id: 窗口 ID
            **kwargs: 要修改的字段，支持:
                name, proxy_config, proxy_id, fingerprint_args,
                launch_args, core_id, tags, user_data_dir
        """
        # 先获取当前配置
        current = self.get_profile(profile_id)

        data = {
            "profileName": kwargs.get("name", current.get("profileName", "")),
            "proxyConfig": kwargs.get("proxy_config", current.get("proxyConfig", "")),
            "proxyId": kwargs.get("proxy_id", current.get("proxyId", "")),
            "fingerprintArgs": kwargs.get("fingerprint_args", current.get("fingerprintArgs", [])),
            "launchArgs": kwargs.get("launch_args", current.get("launchArgs", [])),
            "coreId": kwargs.get("core_id", current.get("coreId", "")),
            "tags": kwargs.get("tags", current.get("tags", [])),
            "userDataDir": kwargs.get("user_data_dir", current.get("userDataDir", "")),
        }

        result = self._put(f"/api/profiles/{profile_id}", data)
        if not result.get("ok"):
            raise RuntimeError(f"修改失败: {result.get('error')}")
        return result["profile"]

    def delete_profile(self, profile_id):
        """删除窗口配置"""
        result = self._delete(f"/api/profiles/{profile_id}")
        if not result.get("ok"):
            raise RuntimeError(f"删除失败: {result.get('error')}")
        return True

    # ========================================================================
    # 实例控制（启动/停止/状态）
    # ========================================================================

    def start(self, profile_id, proxy_config=None, launch_args=None, start_urls=None, reset_user_data=False):
        """
        启动浏览器窗口

        Args:
            profile_id: 窗口 ID
            proxy_config: 临时覆盖代理配置（不保存到配置中），支持:
                - ipfoxy://host:port:username:password
                - socks5://host:port
                - http://host:port
                - direct://
            launch_args: 本次启动的额外参数（不保存）
            start_urls: 启动时打开的 URL 列表
            reset_user_data: 是否重置用户数据（清空Cookie/缓存/历史等，全新身份启动）

        Returns:
            dict: {"profileId", "pid", "debugPort", "running"}
        """
        data = {
            "profileId": profile_id,
            "proxyConfig": proxy_config or "",
            "launchArgs": launch_args or [],
            "startUrls": start_urls or [],
            "resetUserData": reset_user_data,
        }
        result = self._post("/api/instances/start", data)
        if not result.get("ok"):
            raise RuntimeError(f"启动失败: {result.get('error')}")
        return result

    def stop(self, profile_id):
        """停止浏览器窗口"""
        result = self._post("/api/instances/stop", {"profileId": profile_id})
        if not result.get("ok"):
            raise RuntimeError(f"停止失败: {result.get('error')}")
        return True

    def status(self, profile_id=None):
        """
        查询实例状态

        Args:
            profile_id: 指定窗口 ID 查询单个，不指定则查询全部
        """
        params = {}
        if profile_id:
            params["profileId"] = profile_id
        return self._get("/api/instances/status", params)

    # ========================================================================
    # Cookie 管理
    # ========================================================================

    def get_cookies(self, profile_id, urls=None):
        """获取运行中窗口的 Cookie"""
        data = {"profileId": profile_id, "urls": urls or []}
        result = self._post("/api/cookies/get", data)
        if not result.get("ok"):
            raise RuntimeError(f"获取 Cookie 失败: {result.get('error')}")
        return result.get("cookies", [])

    def set_cookies(self, profile_id, cookies):
        """
        设置 Cookie

        Args:
            profile_id: 窗口 ID（必须正在运行）
            cookies: Cookie 列表，每个 cookie 是 dict:
                [{"name": "xxx", "value": "yyy", "domain": ".example.com", "path": "/"}]
        """
        data = {"profileId": profile_id, "cookies": cookies}
        result = self._post("/api/cookies/set", data)
        if not result.get("ok"):
            raise RuntimeError(f"设置 Cookie 失败: {result.get('error')}")
        return True

    def clear_cookies(self, profile_id):
        """清除运行中窗口的所有 Cookie"""
        data = {"profileId": profile_id}
        result = self._post("/api/cookies/clear", data)
        if not result.get("ok"):
            raise RuntimeError(f"清除 Cookie 失败: {result.get('error')}")
        return True

    # ========================================================================
    # 批量操作
    # ========================================================================

    def batch_create(self, profiles):
        """
        批量创建窗口（最多 100 个）

        Args:
            profiles: 配置列表，每个元素是 dict:
                [{"profileName": "xxx", "proxyConfig": "...", "fingerprintArgs": [...]}]

        Returns:
            dict: {"total", "successCount", "results": [...]}
        """
        result = self._post("/api/batch/create", {"profiles": profiles})
        if not result.get("ok"):
            raise RuntimeError(f"批量创建失败: {result.get('error')}")
        return result

    # ========================================================================
    # 便捷方法
    # ========================================================================

    def create_and_start(self, name="", proxy_config="", fingerprint_args=None,
                         start_urls=None, **kwargs):
        """创建窗口并立即启动，代理在创建时就绑定"""
        profile = self.create_profile(
            name=name,
            proxy_config=proxy_config,
            fingerprint_args=fingerprint_args,
            **kwargs,
        )
        pid = profile["profileId"]
        result = self.start(pid, start_urls=start_urls)
        result["profileId"] = pid
        return result

    def stop_and_delete(self, profile_id):
        """停止并删除窗口"""
        try:
            self.stop(profile_id)
        except:
            pass  # 可能已经停止
        time.sleep(1)
        return self.delete_profile(profile_id)

    def stop_all(self):
        """停止所有运行中的窗口"""
        status = self.status()
        stopped = 0
        for inst in status.get("instances", []):
            if inst.get("running"):
                try:
                    self.stop(inst["profileId"])
                    stopped += 1
                except:
                    pass
        return stopped

    def delete_all(self):
        """停止并删除所有窗口"""
        self.stop_all()
        time.sleep(2)
        profiles = self.list_profiles()
        deleted = 0
        for p in profiles:
            try:
                self.delete_profile(p["profileId"])
                deleted += 1
            except:
                pass
        return deleted


# ============================================================================
# 使用示例
# ============================================================================

if __name__ == "__main__":
    # 连接 API Server（需要先启动 Ant Browser）
    # 端口在 Ant Browser 启动日志中可以看到
    client = AntBrowserClient(port=12001)  # 改成你的实际端口

    print("=== 健康检查 ===")
    print(client.health())

    print("\n=== 创建带 IPFoxy 代理的窗口 ===")
    profile = client.create_profile(
        name="测试账号1",
        proxy_config="ipfoxy://gate-sg.ipfoxy.io:58688:customer-xxx:password",
        fingerprint_args=[
            "--fingerprint-brand=Chrome",
            "--fingerprint-platform=windows",
            "--fingerprint-hardware-concurrency=8",
            "--fingerprint-device-memory=16",
            "--fingerprint-canvas-noise=true",
            "--fingerprint-webgl-vendor=Intel Inc.",
            "--fingerprint-webgl-renderer=Intel(R) UHD Graphics 630",
            "--fingerprint-audio-noise=true",
        ],
        tags=["自动化", "IPFoxy"],
    )
    print(f"创建成功: {profile['profileId']}")

    print("\n=== 启动窗口 ===")
    result = client.start(profile["profileId"], start_urls=["https://ipinfo.io"])
    print(f"PID: {result.get('pid')}, Debug Port: {result.get('debugPort')}")

    print("\n=== 查询状态 ===")
    print(client.status(profile["profileId"]))

    input("\n按回车停止并删除窗口...")

    print("\n=== 停止并删除 ===")
    client.stop_and_delete(profile["profileId"])
    print("完成")
