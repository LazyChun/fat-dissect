"""
FatNotes Bespoke Plugin — fat-dissect Backend Entry Point

解剖工具后端入口（初始化骨架）。

前端调用方式：
    const result = await sdk.backend.invoke("dissect.ping", {});

后续在此按 @handler("dissect.xxx") 注册各解剖能力的后端实现。
"""

from plugin_runtime import handler, run


@handler("dissect.ping")
def dissect_ping(_params):
    """健康检查：前端可用来验证 backend 通道是否正常。"""
    return {"pong": True}


if __name__ == "__main__":
    run()
