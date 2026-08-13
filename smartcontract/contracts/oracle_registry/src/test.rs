#![cfg(test)]
use super::*;
use soroban_sdk::testutils::Address as _;

fn setup() -> (Env, Address, OracleRegistryClient<'static>) {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(OracleRegistry, ());
    let client = OracleRegistryClient::new(&env, &contract_id);
    env.mock_all_auths();
    client.init(&admin);
    (env, admin, client)
}

#[test]
fn test_init_sets_admin() {
    let (env, admin, client) = setup();
    // A freshly initialized registry authorizes nobody yet.
    let random = Address::generate(&env);
    assert!(!client.is_oracle_authorized(&random));
    // Admin is stored (re-init would panic — covered separately).
    let _ = admin;
}

#[test]
#[should_panic(expected = "Already initialized")]
fn test_double_init_panics() {
    let (env, _admin, client) = setup();
    let another_admin = Address::generate(&env);
    client.init(&another_admin);
}

#[test]
fn test_add_oracle_authorizes() {
    let (env, _admin, client) = setup();
    let oracle = Address::generate(&env);
    assert!(!client.is_oracle_authorized(&oracle));
    client.add_oracle(&_admin, &oracle);
    assert!(client.is_oracle_authorized(&oracle));
}

#[test]
fn test_remove_oracle_revokes() {
    let (env, admin, client) = setup();
    let oracle = Address::generate(&env);
    client.add_oracle(&admin, &oracle);
    assert!(client.is_oracle_authorized(&oracle));
    client.remove_oracle(&admin, &oracle);
    assert!(!client.is_oracle_authorized(&oracle));
}

#[test]
fn test_multiple_oracles_isolated() {
    let (env, admin, client) = setup();
    let oracle_a = Address::generate(&env);
    let oracle_b = Address::generate(&env);
    client.add_oracle(&admin, &oracle_a);
    // Only oracle_a is authorized; oracle_b remains untrusted.
    assert!(client.is_oracle_authorized(&oracle_a));
    assert!(!client.is_oracle_authorized(&oracle_b));
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_non_admin_cannot_add_oracle() {
    let (env, _admin, client) = setup();
    let attacker = Address::generate(&env);
    let oracle = Address::generate(&env);
    // mock_all_auths() lets require_auth() pass, so this exercises the
    // explicit admin != stored_admin check inside add_oracle.
    client.add_oracle(&attacker, &oracle);
}

#[test]
#[should_panic(expected = "Unauthorized")]
fn test_non_admin_cannot_remove_oracle() {
    let (env, admin, client) = setup();
    let oracle = Address::generate(&env);
    client.add_oracle(&admin, &oracle);
    let attacker = Address::generate(&env);
    client.remove_oracle(&attacker, &oracle);
}
