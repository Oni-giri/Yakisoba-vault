import { task } from "hardhat/config";
import DeploymentTools from "../../../utils/DeploymentsTools";

task("deploy:wave3:save", "Save the deployments to the registry")
  .addParam("deployment", "The deployment to run (production, alpha, staging)")
  .addParam("local", "If we are deploying on the local network")
  .setAction(async (taskArgs, hre) => {
    const ethers = hre.ethers;
    const deploy: string = taskArgs.deployment;

    const {
      getDeployment,
      writeLightRegistry,
      getConstantsMock,
      getHomeChainId,
    } = DeploymentTools;

    const { p, a } = getConstantsMock(deploy, "home_chain_id");
    const local: boolean = taskArgs.local == "true" ? true : false;

    const homeChainId = getHomeChainId(hre, deploy);
    const remoteChainId: number = p.remote_chain_id as any;

    console.log("We now register all of the contracts deployed on testnet");
    const s: string = deploy;

    // Home deploys
    await writeLightRegistry(
      s,
      await getDeployment(s, p.home_chain_id, "Yakisoba", local),
      local
    );
    await writeLightRegistry(
      s,
      await getDeployment(s, p.home_chain_id, "Allocator", local),
      local
    );

    await writeLightRegistry(
      s,
      await getDeployment(s, p.home_chain_id, "BridgeConnectorHomeSTG", local),
      local
    );
    writeLightRegistry(
      s,
      await getDeployment(s, p.home_chain_id, "StrategyOneHome", local),
      local
    );

    if (s != "staging") {
      writeLightRegistry(
        s,
        await getDeployment(s, p.home_chain_id, "Swap", local),
        local
      );
      writeLightRegistry(
        s,
        await getDeployment(s, p.home_chain_id, "AmplificationUtils", local),
        local
      );
      writeLightRegistry(
        s,
        await getDeployment(s, p.home_chain_id, "SwapUtils", local),
        local
      );
    }

    // Remote deploys
    writeLightRegistry(
      s,
      await getDeployment(s, p.remote_chain_id, "Allocator", local),
      local
    );
    writeLightRegistry(
      s,
      await getDeployment(
        s,
        p.remote_chain_id,
        "BridgeConnectorRemoteSTG",
        local
      ),
      local
    );
    writeLightRegistry(
      s,
      await getDeployment(s, p.remote_chain_id, "StrategyOneRemote", local),
      local
    );

    console.log("Home chain " + homeChainId);
    console.log(
      (await getDeployment(s, homeChainId, "Yakisoba", local)).address + " Yakisoba"
    );
    console.log(
      (await getDeployment(s, homeChainId, "Allocator", local)).address +
        " Allocator"
    );
    console.log(
      (await getDeployment(s, homeChainId, "BridgeConnectorHomeSTG", local))
        .address + " BridgeConnectorHomeSTG"
    );
    console.log(
      (await getDeployment(s, homeChainId, "StrategyOneHome", local)).address +
        " StrategyOneHome"
    );
    if (s != "staging") {
      console.log(
        (await getDeployment(s, homeChainId, "Swap", local)).address + " Swap"
      );
    }
    console.log("Remote chain " + remoteChainId);
    console.log(
      (await getDeployment(s, remoteChainId, "Allocator", local)).address +
        " Allocator"
    );
    console.log(
      (await getDeployment(s, remoteChainId, "BridgeConnectorRemoteSTG", local))
        .address + " BridgeConnectorRemoteSTG"
    );
    console.log(
      (await getDeployment(s, remoteChainId, "StrategyOneRemote", local))
        .address + " StrategyOneRemote"
    );

    console.log("Contracts saved to registry.");

    console.log();
  });
