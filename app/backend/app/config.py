from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = BACKEND_DIR / ".env.local"


class Settings(BaseSettings):
    supabase_url: str
    supabase_service_role_key: str
    internal_api_token: str
    allowed_origin: str = "http://localhost:3000"

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
