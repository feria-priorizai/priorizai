from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_root() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_cors_preflight_from_frontend() -> None:
    response = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
