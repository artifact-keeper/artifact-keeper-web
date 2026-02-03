export interface SsoProvider {
  id: string;
  name: string;
  provider_type: "oidc" | "ldap" | "saml";
  login_url: string;
}

export interface OidcConfig {
  id: string;
  name: string;
  issuer_url: string;
  client_id: string;
  has_secret: boolean;
  scopes: string[];
  attribute_mapping: Record<string, string>;
  auto_create_users: boolean;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface LdapConfig {
  id: string;
  name: string;
  server_url: string;
  bind_dn: string | null;
  has_secret: boolean;
  user_base_dn: string;
  user_filter: string;
  username_attribute: string;
  email_attribute: string;
  display_name_attribute: string;
  groups_attribute: string;
  group_base_dn: string | null;
  group_filter: string | null;
  admin_group_dn: string | null;
  use_starttls: boolean;
  is_enabled: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface SamlConfig {
  id: string;
  name: string;
  entity_id: string;
  sso_url: string;
  slo_url: string | null;
  has_certificate: boolean;
  sp_entity_id: string;
  name_id_format: string;
  attribute_mapping: Record<string, string>;
  sign_requests: boolean;
  require_signed_assertions: boolean;
  admin_group: string | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface LdapTestResult {
  success: boolean;
  message: string;
  response_time_ms: number | null;
}

export interface CreateOidcConfigRequest {
  name: string;
  issuer_url: string;
  client_id: string;
  client_secret: string;
  scopes?: string[];
  attribute_mapping?: Record<string, string>;
  auto_create_users?: boolean;
}

export interface UpdateOidcConfigRequest {
  name?: string;
  issuer_url?: string;
  client_id?: string;
  client_secret?: string;
  scopes?: string[];
  attribute_mapping?: Record<string, string>;
  auto_create_users?: boolean;
}

export interface CreateLdapConfigRequest {
  name: string;
  server_url: string;
  bind_dn?: string;
  bind_password?: string;
  user_base_dn: string;
  user_filter?: string;
  username_attribute?: string;
  email_attribute?: string;
  display_name_attribute?: string;
  groups_attribute?: string;
  group_base_dn?: string;
  group_filter?: string;
  admin_group_dn?: string;
  use_starttls?: boolean;
  priority?: number;
}

export interface UpdateLdapConfigRequest {
  name?: string;
  server_url?: string;
  bind_dn?: string;
  bind_password?: string;
  user_base_dn?: string;
  user_filter?: string;
  username_attribute?: string;
  email_attribute?: string;
  display_name_attribute?: string;
  groups_attribute?: string;
  group_base_dn?: string;
  group_filter?: string;
  admin_group_dn?: string;
  use_starttls?: boolean;
  priority?: number;
}

export interface CreateSamlConfigRequest {
  name: string;
  entity_id: string;
  sso_url: string;
  slo_url?: string;
  certificate: string;
  sp_entity_id?: string;
  name_id_format?: string;
  attribute_mapping?: Record<string, string>;
  sign_requests?: boolean;
  require_signed_assertions?: boolean;
  admin_group?: string;
}

export interface UpdateSamlConfigRequest {
  name?: string;
  entity_id?: string;
  sso_url?: string;
  slo_url?: string;
  certificate?: string;
  sp_entity_id?: string;
  name_id_format?: string;
  attribute_mapping?: Record<string, string>;
  sign_requests?: boolean;
  require_signed_assertions?: boolean;
  admin_group?: string;
}
