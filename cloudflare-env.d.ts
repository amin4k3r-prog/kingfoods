declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    BOOTSTRAP_OWNER_EMAIL?: string;
    BOOTSTRAP_TOKEN?: string;
  }
}
