import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Copy, Link as LinkIcon, Loader2, Play, Plus, Radio, Wallet, X } from "lucide-react";
import { useAccount, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { parseEventLogs, parseUnits } from "viem";
import BackButton from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CONTRACTS, TOKENS, arcTestnet } from "@/config/wagmi";
import { createId, protocolStorage, type PaymentLink, type StreamPlan } from "@/lib/localProtocol";
import { recordPointEvent } from "@/lib/points";
import { erc20Abi, lunexStreamAbi } from "@/config/abis";
import { useApproveToken } from "@/hooks/useApproveToken";
import { toast } from "sonner";

const tokens = ["USDC", "EURC"] as const;

function parsePaymentFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const amount = params.get("amount") || "";
  const token = params.get("token") === "EURC" ? "EURC" : "USDC";
  const recipient = params.get("recipient") || "";
  const memo = params.get("memo") || "";
  return { amount, token, recipient, memo };
}

const LunexPay = () => {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const publicClient = usePublicClient({ chainId: arcTestnet.id });
  const paymentParams = parsePaymentFromUrl();
  const { writeContract: writePayment, data: payTxHash, isPending: isPayPending, error: payError } = useWriteContract();
  const { isSuccess: isPayConfirmed } = useWaitForTransactionReceipt({ hash: payTxHash, chainId: arcTestnet.id });
  const [activeTab, setActiveTab] = useState<"links" | "streams">("links");
  const [amount, setAmount] = useState(paymentParams.amount);
  const [token, setToken] = useState<"USDC" | "EURC">(paymentParams.token);
  const [recipient, setRecipient] = useState(paymentParams.recipient);
  const [memo, setMemo] = useState(paymentParams.memo);
  const [streamAmount, setStreamAmount] = useState("");
  const [streamRecipient, setStreamRecipient] = useState("");
  const [streamRecipients, setStreamRecipients] = useState<{ address: string; amount: string }[]>([]);
  const [streamDuration, setStreamDuration] = useState("2592000");
  const [streamStart, setStreamStart] = useState("");
  const [streamCliff, setStreamCliff] = useState("");
  const [releaseFrequency, setReleaseFrequency] = useState("86400");
  const [streamType, setStreamType] = useState<"linear" | "cliff" | "vesting" | "unlock">("linear");
  const [cancelable, setCancelable] = useState(true);
  const [transferable, setTransferable] = useState(false);
  const [recipientCanClaimAnytime, setRecipientCanClaimAnytime] = useState(true);
  const [links, setLinks] = useState<PaymentLink[]>(() => protocolStorage.loadPaymentLinks(address));
  const [streams, setStreams] = useState<StreamPlan[]>(() => protocolStorage.loadStreams(address));
  const [pendingStream, setPendingStream] = useState<StreamPlan | null>(null);
  const streamTokenConfig = TOKENS[token];
  const streamApproval = useApproveToken(streamTokenConfig.address, CONTRACTS.LUNEX_STREAM, streamTokenConfig.decimals);
  const { writeContract: writeStream, data: streamTxHash, isPending: isStreamPending, error: streamError } = useWriteContract();
  const { isLoading: isStreamConfirming, isSuccess: isStreamConfirmed } = useWaitForTransactionReceipt({ hash: streamTxHash, chainId: arcTestnet.id });

  const isPayerView = Boolean(paymentParams.amount && paymentParams.recipient);
  const shareUrl = useMemo(() => {
    if (!address && !recipient) return "";
    const url = new URL(window.location.origin + "/pay");
    url.searchParams.set("recipient", recipient || address || "");
    url.searchParams.set("amount", amount);
    url.searchParams.set("token", token);
    if (memo) url.searchParams.set("memo", memo);
    return url.toString();
  }, [address, amount, memo, recipient, token]);

  const refresh = () => {
    setLinks(protocolStorage.loadPaymentLinks(address));
    setStreams(protocolStorage.loadStreams(address));
  };

  const createPaymentLink = () => {
    if (!address || !amount || Number(amount) <= 0) return;
    const link: PaymentLink = {
      id: createId("pay"),
      merchant: address,
      recipient: recipient || address,
      amount,
      token,
      memo,
      status: "open",
      createdAt: Date.now(),
    };
    protocolStorage.savePaymentLink(address, link);
    recordPointEvent({ wallet: address, action: "pay", volumeUsd: Number(amount), description: `Created ${token} payment link` });
    refresh();
  };

  const payNow = () => {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    if (!recipient || !amount || Number(amount) <= 0) return;
    const tokenConfig = TOKENS[token];
    writePayment({
      address: tokenConfig.address,
      abi: erc20Abi,
      functionName: "transfer",
      args: [recipient as `0x${string}`, parseUnits(amount, tokenConfig.decimals)],
      chain: arcTestnet,
      account: address,
    });
  };

  const createStream = () => {
    if (!address || !streamRecipient || !streamAmount || Number(streamAmount) <= 0 || Number(streamDuration) <= 0) return;
    const recipients = [{ address: streamRecipient, amount: streamAmount }, ...streamRecipients].filter((item) => item.address && Number(item.amount) > 0);
    const totalAmount = recipients.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    if (totalAmount <= 0) return;
    if (streamApproval.needsApproval(totalAmount.toString())) {
      streamApproval.requestApproval(totalAmount.toString());
      return;
    }
    const rate = totalAmount / Number(streamDuration);
    const startMs = streamStart ? new Date(streamStart).getTime() : Date.now();
    const cliffMs = streamCliff ? new Date(streamCliff).getTime() : undefined;
    const startTime = BigInt(Math.floor(startMs / 1000));
    const endTime = startTime + BigInt(Number(streamDuration));
    const cliffTime = BigInt(cliffMs ? Math.floor(cliffMs / 1000) : 0);
    const streamTypeIndex = ["linear", "cliff", "vesting", "unlock"].indexOf(streamType);
    const stream: StreamPlan = {
      id: createId("stream"),
      sender: address,
      recipient: streamRecipient,
      recipients,
      token,
      totalAmount: totalAmount.toString(),
      durationSeconds: Number(streamDuration),
      ratePerSecond: rate.toFixed(8),
      startTime: startMs,
      endTime: startMs + Number(streamDuration) * 1000,
      cliffTime: cliffMs,
      releaseFrequencySeconds: Number(releaseFrequency || 0),
      streamType,
      cancelable,
      transferable,
      recipientCanClaimAnytime,
      status: "ready",
      createdAt: Date.now(),
    };
    setPendingStream(stream);

    if (recipients.length === 1) {
      writeStream({
        address: CONTRACTS.LUNEX_STREAM,
        abi: lunexStreamAbi,
        functionName: "createStream",
        args: [
          recipients[0].address as `0x${string}`,
          streamTokenConfig.address,
          parseUnits(recipients[0].amount, streamTokenConfig.decimals),
          startTime,
          endTime,
          cliffTime,
          BigInt(Number(releaseFrequency || 0)),
          streamTypeIndex,
          cancelable,
          transferable,
          recipientCanClaimAnytime,
        ],
        chain: arcTestnet,
        account: address,
      });
    } else {
      writeStream({
        address: CONTRACTS.LUNEX_STREAM,
        abi: lunexStreamAbi,
        functionName: "createStreams",
        args: [
          recipients.map((item) => item.address as `0x${string}`),
          recipients.map((item) => parseUnits(item.amount, streamTokenConfig.decimals)),
          streamTokenConfig.address,
          startTime,
          endTime,
          cliffTime,
          BigInt(Number(releaseFrequency || 0)),
          streamTypeIndex,
          cancelable,
          transferable,
          recipientCanClaimAnytime,
        ],
        chain: arcTestnet,
        account: address,
      });
    }
  };

  useEffect(() => {
    if (!isPayConfirmed || !payTxHash || !address) return;
    recordPointEvent({ wallet: address, action: "pay", volumeUsd: Number(amount), txHash: payTxHash, description: `Paid ${amount} ${token}` });
  }, [isPayConfirmed, payTxHash, address, amount, token]);

  useEffect(() => {
    if (!isStreamConfirmed || !streamTxHash || !pendingStream || !address) return;
    let cancelled = false;
    const persistStream = async () => {
      let contractStreamIds: string[] = [];
      try {
        const receipt = await publicClient?.getTransactionReceipt({ hash: streamTxHash });
        if (receipt) {
          const logs = parseEventLogs({
            abi: lunexStreamAbi,
            eventName: "StreamCreated",
            logs: receipt.logs,
          });
          contractStreamIds = logs.map((log) => log.args.streamId.toString());
        }
      } catch {
        // Keep the local stream record even if event parsing fails.
      }

      if (cancelled) return;
      protocolStorage.saveStream(address, { ...pendingStream, contractStreamIds, createTxHash: streamTxHash, status: "active", updatedAt: Date.now() });
      recordPointEvent({ wallet: address, action: "stream", volumeUsd: Number(pendingStream.totalAmount), txHash: streamTxHash, description: `Created ${token} payment stream` });
      setPendingStream(null);
      refresh();
      toast.success("Stream created", { description: contractStreamIds.length ? `Created stream ID${contractStreamIds.length > 1 ? "s" : ""} ${contractStreamIds.join(", ")}` : "The stream is active on the Lunex Stream contract." });
    };

    persistStream();
    return () => {
      cancelled = true;
    };
  }, [isStreamConfirmed, streamTxHash, pendingStream, address, token, publicClient]);

  useEffect(() => {
    if (payError) toast.error("Payment failed", { description: payError.message.slice(0, 120) });
  }, [payError]);

  useEffect(() => {
    if (streamError) toast.error("Stream creation failed", { description: streamError.message.slice(0, 120) });
  }, [streamError]);

  const addRecipientRow = () => setStreamRecipients((items) => [...items, { address: "", amount: "" }]);
  const updateRecipientRow = (index: number, updates: Partial<{ address: string; amount: string }>) => {
    setStreamRecipients((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, ...updates } : item));
  };
  const removeRecipientRow = (index: number) => setStreamRecipients((items) => items.filter((_, itemIndex) => itemIndex !== index));

  return (
    <div className="container max-w-6xl mx-auto py-16 px-4">
      <div className="mb-10">
        <BackButton />
        <div className="flex items-center gap-3 mt-6">
          <Wallet className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight uppercase">Lunex Pay</h1>
        </div>
        <p className="text-muted-foreground text-sm font-mono mt-1">Stablecoin payment links and streaming plans</p>
      </div>

      <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-8">
        <section className="border border-border bg-card rounded-sm overflow-hidden">
          <div className="flex bg-muted/20 border-b border-border">
            {(["links", "streams"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 h-12 text-[10px] font-black uppercase tracking-widest ${activeTab === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                {tab === "links" ? "Payment Links" : "Streams"}
              </button>
            ))}
          </div>

          {activeTab === "links" ? (
            <div className="p-6 space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <Input value={amount} onChange={(event) => setAmount(event.target.value)} type="number" placeholder="Amount" className="h-12 font-mono" />
                <div className="flex gap-px bg-border h-12">
                  {tokens.map((nextToken) => (
                    <button key={nextToken} onClick={() => setToken(nextToken)} className={`flex-1 text-xs font-black ${token === nextToken ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}>{nextToken}</button>
                  ))}
                </div>
              </div>
              <Input value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder={address || "Recipient wallet"} className="h-12 font-mono text-xs" />
              <Input value={memo} onChange={(event) => setMemo(event.target.value)} placeholder="Memo or invoice reference" className="h-12" />
              <div className="grid sm:grid-cols-2 gap-3">
                <Button disabled={!isConnected || !amount || Number(amount) <= 0} onClick={createPaymentLink} className="h-12 gap-2 font-black uppercase tracking-widest text-[10px]">
                  <LinkIcon className="h-4 w-4" /> Create Link
                </Button>
                <Button variant="outline" disabled={!shareUrl} onClick={() => navigator.clipboard?.writeText(shareUrl)} className="h-12 gap-2 font-black uppercase tracking-widest text-[10px]">
                  <Copy className="h-4 w-4" /> Copy URL
                </Button>
              </div>
              {isPayerView && (
                <div className="border border-primary/30 bg-primary/5 p-4">
                  <p className="text-[10px] text-primary font-black uppercase tracking-widest mb-2">Payment request loaded</p>
                  <Button disabled={isPayPending || !recipient} onClick={payNow} className="w-full h-11 gap-2 font-black uppercase tracking-widest text-[10px]">
                    {isPayPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    Pay {amount} {token}
                  </Button>
                  {payTxHash && <p className="text-xs font-mono break-all mt-3 text-primary">{payTxHash}</p>}
                </div>
              )}
            </div>
          ) : (
            <div className="p-6 space-y-5">
              <div className="flex gap-px bg-border h-11">
                {(["linear", "vesting", "cliff", "unlock"] as const).map((nextType) => (
                  <button
                    key={nextType}
                    onClick={() => setStreamType(nextType)}
                    className={`flex-1 text-[10px] font-black uppercase tracking-widest ${streamType === nextType ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"}`}
                  >
                    {nextType}
                  </button>
                ))}
              </div>
              <Input value={streamRecipient} onChange={(event) => setStreamRecipient(event.target.value)} placeholder="Primary recipient wallet" className="h-12 font-mono text-xs" />
              <div className="grid sm:grid-cols-2 gap-4">
                <Input value={streamAmount} onChange={(event) => setStreamAmount(event.target.value)} type="number" placeholder="Total amount" className="h-12 font-mono" />
                <Input value={streamDuration} onChange={(event) => setStreamDuration(event.target.value)} type="number" placeholder="Duration in seconds" className="h-12 font-mono" />
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Start</label>
                  <Input value={streamStart} onChange={(event) => setStreamStart(event.target.value)} type="datetime-local" className="h-12 mt-2 text-xs" />
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Cliff</label>
                  <Input value={streamCliff} onChange={(event) => setStreamCliff(event.target.value)} type="datetime-local" className="h-12 mt-2 text-xs" />
                </div>
                <div>
                  <label className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground">Release every sec</label>
                  <Input value={releaseFrequency} onChange={(event) => setReleaseFrequency(event.target.value)} type="number" className="h-12 mt-2 font-mono" />
                </div>
              </div>
              <div className="space-y-2">
                {streamRecipients.map((item, index) => (
                  <div key={index} className="grid grid-cols-[1fr_120px_40px] gap-2">
                    <Input value={item.address} onChange={(event) => updateRecipientRow(index, { address: event.target.value })} placeholder="Additional recipient" className="h-10 font-mono text-xs" />
                    <Input value={item.amount} onChange={(event) => updateRecipientRow(index, { amount: event.target.value })} placeholder="Amount" className="h-10 font-mono" />
                    <button onClick={() => removeRecipientRow(index)} className="h-10 border border-border flex items-center justify-center text-muted-foreground hover:text-destructive">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button onClick={addRecipientRow} className="h-10 px-3 border border-border text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary flex items-center gap-2">
                  <Plus className="h-3 w-3" /> Add recipient
                </button>
              </div>
              <div className="grid sm:grid-cols-3 gap-2">
                {[
                  { label: "Cancelable", value: cancelable, set: setCancelable },
                  { label: "Transferable", value: transferable, set: setTransferable },
                  { label: "Claim Anytime", value: recipientCanClaimAnytime, set: setRecipientCanClaimAnytime },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => item.set(!item.value)}
                    className={`h-10 border text-[10px] font-black uppercase tracking-widest ${item.value ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="border border-border bg-muted/10 p-4 text-xs text-muted-foreground">
                Streams are created on the Lunex Stream contract on Arc. Recipients accrue claimable balance continuously according to the selected schedule.
              </div>
              <Button disabled={!isConnected || !streamRecipient || !streamAmount || Number(streamAmount) <= 0 || streamApproval.isApproving || isStreamPending || isStreamConfirming} onClick={createStream} className="w-full h-12 gap-2 font-black uppercase tracking-widest text-[10px]">
                {streamApproval.isApproving || isStreamPending || isStreamConfirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}
                {isStreamPending || isStreamConfirming ? "Creating Stream" : "Create Stream"}
              </Button>
            </div>
          )}
        </section>

        <section className="space-y-6">
          <div className="border border-border bg-card rounded-sm p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground mb-4">Recent links</p>
            <div className="space-y-3">
              {links.slice(0, 5).map((link) => (
                <div key={link.id} className="border border-border bg-muted/10 p-3">
                  <p className="text-xs font-bold font-mono">{link.amount} {link.token}</p>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-widest mt-1">{link.memo || "Payment request"} · {link.status}</p>
                </div>
              ))}
              {links.length === 0 && <p className="text-xs text-muted-foreground">No payment links yet.</p>}
            </div>
          </div>

          <div className="border border-border bg-card rounded-sm p-6">
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground mb-4">Stream plans</p>
            <div className="space-y-3">
              {streams.slice(0, 5).map((stream) => (
                <div key={stream.id} className="border border-border bg-muted/10 p-3">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="h-3 w-3 text-primary" />
                    <p className="text-xs font-bold font-mono">{stream.ratePerSecond} {stream.token}/sec</p>
                  </div>
                  <p className="text-[9px] text-muted-foreground uppercase tracking-widest mt-1">{stream.totalAmount} total · {stream.streamType ?? "linear"} · {stream.recipients?.length ?? 1} recipient(s)</p>
                  {stream.createTxHash && <p className="text-[9px] text-primary uppercase tracking-widest mt-1">onchain · {stream.status}</p>}
                </div>
              ))}
              {streams.length === 0 && <p className="text-xs text-muted-foreground">No stream plans yet.</p>}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default LunexPay;
