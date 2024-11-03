import { ethers } from "hardhat"
import { expect } from "chai"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { Contract, Signer } from "ethers"

describe("CandideIntentWallet", function () {
    async function deployFixture() {
        const [owner, otherAccount] = await ethers.getSigners()

        // Deploy EntryPoint
        const EntryPoint = await ethers.getContractFactory("MockEntryPoint")
        const entryPoint = await EntryPoint.deploy()

        // Deploy Token
        const Token = await ethers.getContractFactory("MockToken")
        const token = await Token.deploy()

        // Deploy Settler
        const Settler = await ethers.getContractFactory("MockSettler")
        const settler = await Settler.deploy()
        const settlerAddress = await settler.getAddress()

        // Deploy Wallet
        const Wallet = await ethers.getContractFactory("CandideIntentWallet")
        const wallet = await Wallet.deploy(await entryPoint.getAddress())

        // Setup wallet with both owner and settler as authorized
        await wallet.setup([owner.address, settlerAddress], 1)

        // Approve settler on the current chain (chainId 31337 for Hardhat)
        await wallet.setSettlerApproval(31337, settlerAddress, true)

        // Fund wallet with tokens
        await token.transfer(
            await wallet.getAddress(),
            ethers.parseUnits("1000", 18)
        )

        return {
            wallet,
            token,
            settler,
            entryPoint,
            owner,
            otherAccount
        }
    }

    // In your CandideIntentWallet.test.ts

    it("Should execute cross-chain intent", async function () {
        const { wallet, settler, token } = await loadFixture(deployFixture)

        const orderId = ethers.keccak256(ethers.toUtf8Bytes("test"))
        const walletAddress = await wallet.getAddress()
        const settlerAddress = await settler.getAddress()
        const chainId = 31337 // Hardhat's chainId

        // First, create a simple target function call that will succeed
        // For example, let's call a simple transfer on the token contract
        const targetAddress = await token.getAddress()
        const amount = ethers.parseUnits("1", 18)
        const transferCalldata = token.interface.encodeFunctionData(
            "transfer",
            [
                settlerAddress, // recipient
                amount
            ]
        )

        // Encode the execution data properly
        const mockExecutionData = ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "bytes"],
            [
                targetAddress, // The actual target contract we want to interact with
                transferCalldata // The actual function call data
            ]
        )

        // Execute the intent
        const tx = await settler.executeIntent(
            walletAddress,
            orderId,
            chainId,
            mockExecutionData
        )

        // Wait for the transaction
        const receipt = await tx.wait()
        expect(receipt?.status).to.equal(1)

        // Verify the intent was executed
        expect(await wallet.executedIntents(orderId)).to.be.true

        // Verify the transfer actually happened
        expect(await token.balanceOf(settlerAddress)).to.equal(amount)
    })
})
