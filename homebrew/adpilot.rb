class Adpilot < Formula
  desc "A powerful CLI for the Meta/Facebook Marketing API"
  homepage "https://github.com/connorodea/adpilot"
  url "https://registry.npmjs.org/adpilot/-/adpilot-1.0.0.tgz"
  # sha256 will need to be filled in after npm publish
  sha256 "PLACEHOLDER"
  license "MIT"

  depends_on "node@20"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    assert_match "adpilot", shell_output("#{bin}/adpilot --version")
  end
end
