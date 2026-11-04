// Stub for H1's McpInputsTable (replaced by the owner's version at merge).
import type { McpInput } from "@/types/mcp";

export function McpInputsTable({ inputs, caption }: { inputs: McpInput[]; caption: string }) {
  return (
    <table>
      <caption>{caption}</caption>
      <tbody>
        {inputs.map((i, n) => (
          <tr key={`${i.name ?? ""}-${n}`}>
            <td>{i.name}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
