/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Model aur wasm files badi hain, browser/CDN inhe lambe time tak cache kare.
        source: "/:dir(models|mediapipe)/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
