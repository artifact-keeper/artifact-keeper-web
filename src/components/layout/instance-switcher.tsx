"use client";

import { useState } from "react";
import { Globe, Check, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useInstance } from "@/providers/instance-provider";
import { isValidInstanceUrl } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function InstanceSwitcher() {
  const { instances, activeInstance, switchInstance, addInstance, removeInstance, instanceStatuses, refreshStatuses } = useInstance();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!name.trim() || !url.trim()) return;
    const trimmedUrl = url.trim().replace(/\/$/, "");
    if (!isValidInstanceUrl(trimmedUrl)) {
      toast.error("Invalid instance URL. Private IPs, localhost, and non-HTTP protocols are not allowed.");
      return;
    }
    setAdding(true);
    try {
      await addInstance({
        name: name.trim(),
        url: trimmedUrl,
        apiKey: apiKey.trim() || "",
      });
      setAddOpen(false);
      setName("");
      setUrl("");
      setApiKey("");
    } catch {
      toast.error("Failed to add instance. Check the URL and try again.");
    } finally {
      setAdding(false);
    }
  };

  return (
    <>
      <DropdownMenu onOpenChange={(open) => { if (open) refreshStatuses(); }}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <Globe className="size-4" />
            <span className="hidden sm:inline text-sm">{activeInstance.name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {instances.map((inst) => (
            <DropdownMenuItem
              key={inst.id}
              className="flex items-center justify-between"
              onClick={() => {
                if (inst.id !== activeInstance.id) switchInstance(inst.id);
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                {inst.id === activeInstance.id && <Check className="size-4 text-green-500 shrink-0" />}
                {inst.id !== activeInstance.id && <div className="size-4 shrink-0" />}
                <span className={`size-2 rounded-full shrink-0 ${instanceStatuses[inst.id] === true ? "bg-green-500" : instanceStatuses[inst.id] === false ? "bg-red-400" : "bg-gray-400"}`} />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{inst.name}</div>
                  {inst.url && (
                    <div className="text-xs text-muted-foreground truncate">{inst.url}</div>
                  )}
                </div>
              </div>
              {inst.id !== "local" && (
                <button
                  className="ml-2 p-1 hover:text-destructive shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeInstance(inst.id);
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setAddOpen(true)}>
            <Plus className="size-4 mr-2" />
            Add Instance
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Artifact Keeper Instance</DialogTitle>
            <DialogDescription>
              Connect to a remote Artifact Keeper instance to browse its repositories and artifacts.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="inst-name">Name</Label>
              <Input
                id="inst-name"
                placeholder="Production"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inst-url">URL</Label>
              <Input
                id="inst-url"
                placeholder="https://artifacts.example.com"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inst-key">API Key</Label>
              <Input
                id="inst-key"
                placeholder="Optional -- stored encrypted on server"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={!name.trim() || !url.trim() || adding}>
              {adding ? "Adding..." : "Add Instance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
