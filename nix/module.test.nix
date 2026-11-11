{ pkgs }:
let
  package = pkgs.runCommand "t3code-module-fixture" { meta.mainProgram = "t3code-desktop"; } "";
  evaluated = import (pkgs.path + "/nixos/lib/eval-config.nix") {
    system = pkgs.stdenv.hostPlatform.system;
    modules = [
      ./module.nix
      {
        services.t3code = {
          enable = true;
          inherit package;
          user = "tester";
          home = "/var/lib/t3-test";
          host = "127.0.0.1";
          port = 18789;
        };
        users.users.tester.isNormalUser = true;
        system.stateVersion = "26.05";
      }
    ];
  };
  command = evaluated.config.systemd.services.t3code.serviceConfig.ExecStart;
in
assert
  command
  == "${package}/bin/t3 serve --no-browser --base-dir /var/lib/t3-test --host 127.0.0.1 --port 18789";
true
