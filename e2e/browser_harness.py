"""
author: Varanasi E2E Test Suite
harness: Headless Playwright browser manager with single-process args and strict zero-error capture.
"""
import os
from typing import List, Dict, Any, Optional
from playwright.sync_api import sync_playwright, Page, Browser, Playwright

DEFAULT_SHELL_PATH = "/Users/ramprasadgoud/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell"
LAUNCH_ARGS = ["--single-process", "--no-sandbox", "--disable-gpu"]

class BrowserSession:
    """
    Context manager for Playwright headless execution with strict zero-console-error enforcement.
    """
    def __init__(self, executable_path: Optional[str] = None):
        self.executable_path = executable_path or os.environ.get("PLAYWRIGHT_CHROME_SHELL", DEFAULT_SHELL_PATH)
        self.playwright: Optional[Playwright] = None
        self.browser: Optional[Browser] = None
        self.page: Optional[Page] = None
        self.console_logs: List[Dict[str, str]] = []
        self.console_errors: List[str] = []
        self.page_errors: List[str] = []

    def __enter__(self) -> "BrowserSession":
        self.playwright = sync_playwright().start()
        
        launch_kwargs: Dict[str, Any] = {
            "headless": True,
            "args": LAUNCH_ARGS,
        }
        if os.path.exists(self.executable_path):
            launch_kwargs["executable_path"] = self.executable_path

        self.browser = self.playwright.chromium.launch(**launch_kwargs)
        self.page = self.browser.new_page()

        # Attach listeners for console messages and uncaught exceptions
        def handle_console(msg):
            entry = {"type": msg.type, "text": msg.text}
            self.console_logs.append(entry)
            if msg.type == "error":
                self.console_errors.append(msg.text)

        def handle_pageerror(err):
            self.page_errors.append(str(err))

        self.page.on("console", handle_console)
        self.page.on("pageerror", handle_pageerror)

        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.page:
            self.page.close()
        if self.browser:
            self.browser.close()
        if self.playwright:
            self.playwright.stop()

    def assert_zero_errors(self, context_name: str = "page"):
        """Fails assertion if any console error or page exception occurred."""
        if self.console_errors:
            errors_str = "\n".join(f"  - {e}" for e in self.console_errors)
            raise AssertionError(
                f"Zero Console Error Policy Violated in {context_name}:\n{errors_str}"
            )
        if self.page_errors:
            errors_str = "\n".join(f"  - {e}" for e in self.page_errors)
            raise AssertionError(
                f"Zero Page Error Policy Violated in {context_name}:\n{errors_str}"
            )
