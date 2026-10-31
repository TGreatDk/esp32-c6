declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    DEVICE_CONTROL_KEY?: string;
  }
}
