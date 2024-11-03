import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const { deployments, getNamedAccounts, network } = hre
    const { deploy } = deployments
    const { deployer } = await getNamedAccounts()

    // First deploy MockEntryPoint for test networks, or use existing EntryPoint for mainnet
    let entryPointAddress: string

    if (network.name === "hardhat" || network.name.includes("sepolia")) {
        console.log("📝 Deploying MockEntryPoint...")
        const mockEntryPoint = await deploy("MockEntryPoint", {
            from: deployer,
            args: [],
            log: true,
            waitConfirmations: network.name === "hardhat" ? 1 : 5
        })
        entryPointAddress = mockEntryPoint.address
        console.log("✅ MockEntryPoint deployed to:", entryPointAddress)
    } else {
        // For mainnet and other production networks, use the official EntryPoint
        switch (network.name) {
            case "optimism":
                entryPointAddress = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"
                break
            default:
                throw new Error(
                    `No EntryPoint address configured for network: ${network.name}`
                )
        }
        console.log("📝 Using existing EntryPoint at:", entryPointAddress)
    }

    // Deploy CandideIntentWallet
    console.log("📝 Deploying CandideIntentWallet...")
    const candideIntentWallet = await deploy("CandideIntentWallet", {
        from: deployer,
        args: [entryPointAddress],
        log: true,
        waitConfirmations: network.name === "hardhat" ? 1 : 5
    })

    console.log(
        "✅ CandideIntentWallet deployed to:",
        candideIntentWallet.address
    )

    // Verify contracts on Etherscan if not on hardhat network
    if (network.name !== "hardhat") {
        if (process.env.ETHERSCAN_API_KEY || process.env.OP_ETHERSCAN_API_KEY) {
            console.log("🔍 Verifying contracts on Etherscan...")
            try {
                await hre.run("verify:verify", {
                    address: candideIntentWallet.address,
                    constructorArguments: [entryPointAddress]
                })
                console.log("✅ Verification complete")
            } catch (error) {
                console.log("❌ Verification failed:", error)
            }

            // Verify MockEntryPoint if deployed
            if (network.name.includes("sepolia")) {
                try {
                    await hre.run("verify:verify", {
                        address: entryPointAddress,
                        constructorArguments: []
                    })
                    console.log("✅ MockEntryPoint verification complete")
                } catch (error) {
                    console.log("❌ MockEntryPoint verification failed:", error)
                }
            }
        } else {
            console.log("⚠️ No Etherscan API key found, skipping verification")
        }
    }
}

func.tags = ["CandideIntentWallet"]
func.dependencies = []

export default func
