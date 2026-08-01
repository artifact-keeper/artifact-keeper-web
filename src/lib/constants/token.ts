export const SCOPES = [
  { value: "read:artifacts", label: "Read" },
  { value: "write:artifacts", label: "Write" },
  { value: "delete:artifacts", label: "Delete" },
  { value: "admin", label: "Admin" },
] as const;

export const EXPIRY_OPTIONS = [
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "1 year" },
  { value: "0", label: "Never" },
] as const;
