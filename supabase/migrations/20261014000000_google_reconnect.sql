-- Set when Google rejects the stored refresh token (revoked, or expired after 7 days while the
-- OAuth app is in Testing mode). Cleared when the user reconnects.
alter table google_accounts add column needs_reconnect boolean not null default false;
