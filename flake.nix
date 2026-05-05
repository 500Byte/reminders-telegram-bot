{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable"; # Or your preferred channel
  };

  outputs =
    inputs@{ self, nixpkgs, ... }:
    let

      forAllSystems =
        function:
        nixpkgs.lib.genAttrs
          [
            "x86_64-linux"
            "aarch64-linux"
            "x86_64-darwin"
            "aarch64-darwin"
          ]
          (
            system:
            function (
              import nixpkgs {
                inherit system;
                # overlays = [ ... ]; # You can add overlays here if needed
                # config = { ... };   # Or pkgs configuration
              }
            )
          );

    in
    rec {
      devShell = forAllSystems (
        pkgs:
        pkgs.mkShell {
          name = "my-dev-environment";
          buildInputs = with pkgs; [
            nodejs_latest
            nodePackages_latest.typescript-language-server
            nodePackages_latest.prettier
            vscode-langservers-extracted
          ];
          # You can add shell hooks or environment variables here too
          # shellHook = ''
          #   echo "Welcome to the development shell!"
          #   export MY_VAR="hello"
          # '';
        }
      );

      devShells = devShell;

      packages = forAllSystems (pkgs: {
        dockerImage = pkgs.dockerTools.buildImage {
          name = "cf-workers-telegram-bot";
          tag = "latest";
          fromImage = pkgs.dockerTools.pullImage {
            imageName = "jacoblincool/workerd";
            imageDigest = "sha256:9ef73cacee85040a3c742b22ca0b8ee527d20465af58d4408f024cec1caf347c";
            sha256 = "sha256-7Ee5kG8qvGIzk3uyE/35fojl/qbsBvuBquJBWZGIqvA=";
          };
          copyToRoot = pkgs.buildEnv {
            name = "image-root";
            paths = [
              (pkgs.stdenv.mkDerivation {
                name = "docker-root";
                buildCommand = ''
                  mkdir -p $out/worker
                  cp ${./worker.capnp} $out/worker/worker.capnp
                  cp -r ${self.packages.${pkgs.system}.default}/* $out/
                '';
              })
            ];
          };
          config = {
            Cmd = [
              "/workerd"
              "serve"
              "/worker/worker.capnp"
            ];
            WorkingDir = "/";
          };
        };
        default = pkgs.buildNpmPackage {
          name = "cf-workers-telegram-bot";
          src = ./.;
          npmDepsHash = "sha256-tlxWjtGMnTTMS4or/hZuWEoe+DI6eZRHbOKLsXx/LIY=";
          installPhase = ''
            runHook preInstall
            mkdir -p $out/worker
            cp -r dist/* $out/worker
            runHook postInstall
          '';
        };
      });

      apps = forAllSystems (pkgs: {
        default = {
          type = "app";
          program = "${pkgs.writeScriptBin "run-worker" ''
            #!/bin/sh
            workerd serve ${self.packages.${pkgs.system}.default}/worker.mjs "$@"
          ''}/bin/run-worker";
        };
      });
    };
}
