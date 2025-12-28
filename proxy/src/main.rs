use axum::{
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};

#[tokio::main]
async fn main() {
    let app = Router::new().route("/dhmz", get(proxy));
    let listener = tokio::net::TcpListener::bind("0.0.0.0:8000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn proxy() -> Response {
    match reqwest::get("https://vrijeme.hr/hrvatska1_n.xml").await {
        Ok(r) => (
            StatusCode::OK,
            [
                (header::CONTENT_TYPE, "text/xml"),
                (header::ACCESS_CONTROL_ALLOW_ORIGIN, "*"),
            ],
            r.bytes().await.unwrap_or_default(),
        )
            .into_response(),
        Err(_) => StatusCode::BAD_GATEWAY.into_response(),
    }
}
