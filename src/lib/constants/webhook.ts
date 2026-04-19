export interface PayloadTemplatePreset {
  id: string;
  name: string;
  description: string;
  template: string;
}

export const PAYLOAD_TEMPLATE_PRESETS: PayloadTemplatePreset[] = [
  {
    id: "default",
    name: "Default (JSON)",
    description: "Standard JSON payload with all event fields",
    template: `{
  "event": "{{event}}",
  "timestamp": "{{timestamp}}",
  "artifact": {
    "name": "{{artifact.name}}",
    "version": "{{artifact.version}}",
    "repository": "{{artifact.repository}}",
    "format": "{{artifact.format}}"
  },
  "actor": {
    "username": "{{actor.username}}",
    "email": "{{actor.email}}"
  }
}`,
  },
  {
    id: "slack",
    name: "Slack",
    description: "Slack incoming webhook format with rich formatting",
    template: `{
  "text": "{{event}} in {{artifact.repository}}",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*{{event}}*\\n{{artifact.name}} v{{artifact.version}} in \`{{artifact.repository}}\`"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "By {{actor.username}} at {{timestamp}}"
        }
      ]
    }
  ]
}`,
  },
  {
    id: "discord",
    name: "Discord",
    description: "Discord webhook format with embedded content",
    template: `{
  "content": "{{event}}",
  "embeds": [
    {
      "title": "{{event}}",
      "description": "{{artifact.name}} v{{artifact.version}}",
      "color": 5814783,
      "fields": [
        { "name": "Repository", "value": "{{artifact.repository}}", "inline": true },
        { "name": "Format", "value": "{{artifact.format}}", "inline": true },
        { "name": "Actor", "value": "{{actor.username}}", "inline": true }
      ],
      "timestamp": "{{timestamp}}"
    }
  ]
}`,
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    description: "Microsoft Teams incoming webhook format",
    template: `{
  "@type": "MessageCard",
  "@context": "http://schema.org/extensions",
  "summary": "{{event}}",
  "themeColor": "0076D7",
  "title": "{{event}}",
  "sections": [
    {
      "activityTitle": "{{artifact.name}} v{{artifact.version}}",
      "facts": [
        { "name": "Repository", "value": "{{artifact.repository}}" },
        { "name": "Format", "value": "{{artifact.format}}" },
        { "name": "Actor", "value": "{{actor.username}}" },
        { "name": "Time", "value": "{{timestamp}}" }
      ]
    }
  ]
}`,
  },
  {
    id: "custom",
    name: "Custom",
    description: "Write your own payload template",
    template: "",
  },
];
