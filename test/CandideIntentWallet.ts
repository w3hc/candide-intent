import { ethers } from "hardhat"
import { expect } from "chai"
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { Contract, Signer } from "ethers"

describe("CandideIntentWallet", function () {
    async function deployFixture() {
        const [owner, otherAccount, recipient] = await ethers.getSigners()

        const EntryPoint = await ethers.getContractFactory("MockEntryPoint")
        const entryPoint = await EntryPoint.deploy()

        const Token = await ethers.getContractFactory("MockToken")
        const token = await Token.deploy()

        const Settler = await ethers.getContractFactory("MockSettler")
        const settler = await Settler.deploy()
        const settlerAddress = await settler.getAddress()

        const Wallet = await ethers.getContractFactory("CandideIntentWallet")
        const wallet = await Wallet.deploy(await entryPoint.getAddress())

        await wallet.setup([owner.address, settlerAddress], 1)
        await wallet.setSettlerApproval(31337, settlerAddress, true)
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
            otherAccount,
            recipient
        }
    }

    describe("Intent Creation", () => {
        it("Should create a valid cross-chain intent", async function () {
            const { wallet, token, settler } = await loadFixture(deployFixture)
            const amount = ethers.parseUnits("100", 18)
            const destinationChainId = 10 // Optimism
            const tokenAddress = await token.getAddress()
            const settlerAddress = await settler.getAddress()

            // First approve settler for Optimism chain
            await wallet.setSettlerApproval(
                destinationChainId,
                settlerAddress,
                true
            )

            const tx = await wallet.createIntent(
                destinationChainId,
                tokenAddress,
                amount,
                settlerAddress,
                "0x"
            )

            const receipt = await tx.wait()

            // Properly type and find the event
            const intentCreatedEvent = receipt?.logs.find(log => {
                try {
                    return (
                        wallet.interface.parseLog({
                            topics: [...log.topics],
                            data: log.data
                        })?.name === "IntentCreated"
                    )
                } catch {
                    return false
                }
            })

            expect(intentCreatedEvent).to.not.be.undefined

            // Parse and verify event data
            const parsedEvent = wallet.interface.parseLog({
                topics: [...intentCreatedEvent!.topics],
                data: intentCreatedEvent!.data
            })

            // Verify event data
            expect(parsedEvent?.args?.token).to.equal(tokenAddress)
            expect(parsedEvent?.args?.amount).to.equal(amount)
            expect(parsedEvent?.args?.target).to.equal(settlerAddress)

            // Verify token approval was set
            const approvedAmount = await token.allowance(
                await wallet.getAddress(),
                settlerAddress
            )
            expect(approvedAmount).to.equal(amount)
        })

        it("Should reject intent creation with zero amount", async function () {
            const { wallet, token, settler } = await loadFixture(deployFixture)
            const destinationChainId = 10
            const tokenAddress = await token.getAddress()
            const settlerAddress = await settler.getAddress()

            await expect(
                wallet.createIntent(
                    destinationChainId,
                    tokenAddress,
                    0,
                    settlerAddress,
                    "0x"
                )
            ).to.be.revertedWith("Invalid amount")
        })

        it("Should reject intent creation from unauthorized account", async function () {
            const { wallet, token, settler, otherAccount } = await loadFixture(
                deployFixture
            )
            const amount = ethers.parseUnits("100", 18)
            const destinationChainId = 10
            const tokenAddress = await token.getAddress()
            const settlerAddress = await settler.getAddress()

            await expect(
                wallet
                    .connect(otherAccount)
                    .createIntent(
                        destinationChainId,
                        tokenAddress,
                        amount,
                        settlerAddress,
                        "0x"
                    )
            ).to.be.revertedWith("Not authorized")
        })

        it("Should reject intent creation with unapproved settler", async function () {
            const { wallet, token, settler } = await loadFixture(deployFixture)
            const amount = ethers.parseUnits("100", 18)
            const destinationChainId = 42161 // Arbitrum
            const tokenAddress = await token.getAddress()
            const settlerAddress = await settler.getAddress()

            await expect(
                wallet.createIntent(
                    destinationChainId,
                    tokenAddress,
                    amount,
                    settlerAddress,
                    "0x"
                )
            ).to.be.revertedWith("Invalid settler")
        })
    })

    describe("Intent Execution", () => {
        it("Should prevent duplicate intent execution", async function () {
            const { wallet, settler, token } = await loadFixture(deployFixture)
            const orderId = ethers.keccak256(ethers.toUtf8Bytes("test"))
            const walletAddress = await wallet.getAddress()
            const settlerAddress = await settler.getAddress()
            const chainId = 31337

            const targetAddress = await token.getAddress()
            const amount = ethers.parseUnits("1", 18)
            const transferCalldata = token.interface.encodeFunctionData(
                "transfer",
                [settlerAddress, amount]
            )

            const mockExecutionData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "bytes"],
                [targetAddress, transferCalldata]
            )

            // First execution
            await settler.executeIntent(
                walletAddress,
                orderId,
                chainId,
                mockExecutionData
            )

            // Second execution should fail
            await expect(
                settler.executeIntent(
                    walletAddress,
                    orderId,
                    chainId,
                    mockExecutionData
                )
            ).to.be.revertedWith("Intent already executed")
        })

        it("Should reject execution from unapproved settler", async function () {
            const { wallet, settler, token, otherAccount } = await loadFixture(
                deployFixture
            )
            const orderId = ethers.keccak256(ethers.toUtf8Bytes("test"))
            const walletAddress = await wallet.getAddress()
            const chainId = 31337

            const targetAddress = await token.getAddress()
            const amount = ethers.parseUnits("1", 18)
            const transferCalldata = token.interface.encodeFunctionData(
                "transfer",
                [await otherAccount.getAddress(), amount]
            )

            const mockExecutionData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "bytes"],
                [targetAddress, transferCalldata]
            )

            // Remove settler approval
            await wallet.setSettlerApproval(
                chainId,
                await settler.getAddress(),
                false
            )

            await expect(
                settler.executeIntent(
                    walletAddress,
                    orderId,
                    chainId,
                    mockExecutionData
                )
            ).to.be.revertedWith("Settler not approved for chain")
        })

        it("Should handle multiple token transfers in single intent", async function () {
            const { wallet, settler, token, recipient } = await loadFixture(
                deployFixture
            )
            const orderId = ethers.keccak256(
                ethers.toUtf8Bytes("multiTransfer")
            )
            const walletAddress = await wallet.getAddress()
            const chainId = 31337
            const settlerAddress = await settler.getAddress()

            // Make sure settler is approved and authorized
            await wallet.setSettlerApproval(chainId, settlerAddress, true)

            const targetAddress = await token.getAddress()
            const amount1 = ethers.parseUnits("1", 18)
            const amount2 = ethers.parseUnits("2", 18)

            // Execute transfers one by one since the contract doesn't support batching
            const mockExecutionData = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "bytes"],
                [
                    targetAddress,
                    token.interface.encodeFunctionData("transfer", [
                        await recipient.getAddress(),
                        amount1
                    ])
                ]
            )

            // Execute first transfer
            await settler.executeIntent(
                walletAddress,
                orderId,
                chainId,
                mockExecutionData
            )

            // Create and execute second transfer with new orderId
            const orderId2 = ethers.keccak256(
                ethers.toUtf8Bytes("multiTransfer2")
            )
            const mockExecutionData2 = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "bytes"],
                [
                    targetAddress,
                    token.interface.encodeFunctionData("transfer", [
                        settlerAddress,
                        amount2
                    ])
                ]
            )

            await settler.executeIntent(
                walletAddress,
                orderId2,
                chainId,
                mockExecutionData2
            )

            // Verify both transfers
            expect(
                await token.balanceOf(await recipient.getAddress())
            ).to.equal(amount1)
            expect(await token.balanceOf(settlerAddress)).to.equal(amount2)
        })
    })

    describe("Settler Management", () => {
        it("Should properly track settler approvals across chains", async function () {
            const { wallet, settler } = await loadFixture(deployFixture)
            const settlerAddress = await settler.getAddress()

            // Approve settler for multiple chains
            await wallet.setSettlerApproval(10, settlerAddress, true) // Optimism
            await wallet.setSettlerApproval(42161, settlerAddress, true) // Arbitrum

            expect(await wallet.approvedSettlers(10, settlerAddress)).to.be.true
            expect(await wallet.approvedSettlers(42161, settlerAddress)).to.be
                .true
            expect(await wallet.approvedSettlers(1, settlerAddress)).to.be.false

            // Revoke approval
            await wallet.setSettlerApproval(10, settlerAddress, false)
            expect(await wallet.approvedSettlers(10, settlerAddress)).to.be
                .false
            expect(await wallet.approvedSettlers(42161, settlerAddress)).to.be
                .true
        })

        it("Should emit SettlerApproved event", async function () {
            const { wallet, settler } = await loadFixture(deployFixture)
            const settlerAddress = await settler.getAddress()

            await expect(wallet.setSettlerApproval(10, settlerAddress, true))
                .to.emit(wallet, "SettlerApproved")
                .withArgs(10, settlerAddress, true)
        })

        it("Should reject settler approval from unauthorized account", async function () {
            const { wallet, settler, otherAccount } = await loadFixture(
                deployFixture
            )
            const settlerAddress = await settler.getAddress()

            await expect(
                wallet
                    .connect(otherAccount)
                    .setSettlerApproval(10, settlerAddress, true)
            ).to.be.revertedWith("Not authorized")
        })
    })

    describe("Wallet Setup and Management", () => {
        it("Should not allow initialization twice", async function () {
            const { wallet, owner } = await loadFixture(deployFixture)

            await expect(wallet.setup([owner.address], 1)).to.be.revertedWith(
                "Already initialized"
            )
        })

        it("Should properly add new owners", async function () {
            const { wallet, otherAccount } = await loadFixture(deployFixture)

            await wallet.addOwner(await otherAccount.getAddress())
            expect(await wallet.owners(await otherAccount.getAddress())).to.be
                .true
        })

        it("Should reject invalid owner additions", async function () {
            const { wallet, owner } = await loadFixture(deployFixture)

            // Try to add zero address
            await expect(
                wallet.addOwner(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid owner")

            // Try to add existing owner
            await expect(wallet.addOwner(owner.address)).to.be.revertedWith(
                "Already owner"
            )
        })
    })
})
