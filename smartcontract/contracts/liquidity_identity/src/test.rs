#![cfg(test)]
use super::*;
use soroban_sdk::{symbol_short, testutils::Address as _, BytesN};

/// Helper: create a deterministic 32-byte dummy hash for tests.
fn dummy_hash(env: &Env, seed: u8) -> BytesN<32> {
    BytesN::from_array(env, &[seed; 32])
}

#[contract]
pub struct MockOracleRegistry;

#[contractimpl]
impl MockOracleRegistry {
    pub fn is_oracle_authorized(_env: Env, _oracle: Address) -> bool {
        true
    }
}

fn setup() -> (Env, Address, Address) {
    let env = Env::default();
    let admin = Address::generate(&env);
    let contract_id = env.register(LiquidityIdentity, ());

    // Register mock oracle registry
    let registry_id = env.register(MockOracleRegistry, ());

    // Initialize the main contract
    let client = LiquidityIdentityClient::new(&env, &contract_id);
    env.mock_all_auths();
    client.init(&admin, &symbol_short!("testnet"));
    client.set_oracle_registry(&admin, &registry_id);

    (env, admin, contract_id)
}

#[test]
fn test_constructor() {
    let (env, admin, contract_id) = setup();
    env.mock_all_auths();

    env.as_contract(&contract_id, || {
        let stored_admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        assert_eq!(stored_admin, admin);

        let stored_network: Symbol = env.storage().instance().get(&DataKey::Network).unwrap();
        assert_eq!(stored_network, symbol_short!("testnet"));
    });
}

#[test]
fn test_set_and_get_score() {
    let (env, admin, contract_id) = setup();
    env.mock_all_auths();

    let client = LiquidityIdentityClient::new(&env, &contract_id);

    let wallet = Address::generate(&env);
    let hash = dummy_hash(&env, 0xab);
    client.set_score(&admin, &wallet, &85, &RiskLevel::Low, &hash);

    let score = client.get_score(&wallet);
    assert_eq!(score, 85);

    let risk = client.get_risk(&wallet);
    assert_eq!(risk, Some(RiskLevel::Low));
}

#[test]
fn test_get_nonexistent_score() {
    let (env, _admin, contract_id) = setup();
    env.mock_all_auths();

    let client = LiquidityIdentityClient::new(&env, &contract_id);

    let wallet = Address::generate(&env);
    let score = client.get_score(&wallet);
    assert_eq!(score, 0);

    let risk = client.get_risk(&wallet);
    assert!(risk.is_none());
}

#[test]
fn test_risk_level_mapping() {
    let (env, admin, contract_id) = setup();
    env.mock_all_auths();

    let client = LiquidityIdentityClient::new(&env, &contract_id);

    let wallet1 = Address::generate(&env);
    let wallet2 = Address::generate(&env);
    let wallet3 = Address::generate(&env);

    client.set_score(
        &admin,
        &wallet1,
        &85,
        &RiskLevel::Low,
        &dummy_hash(&env, 0x01),
    );
    client.set_score(
        &admin,
        &wallet2,
        &55,
        &RiskLevel::Medium,
        &dummy_hash(&env, 0x02),
    );
    client.set_score(
        &admin,
        &wallet3,
        &25,
        &RiskLevel::High,
        &dummy_hash(&env, 0x03),
    );

    assert_eq!(client.get_risk(&wallet1), Some(RiskLevel::Low));
    assert_eq!(client.get_risk(&wallet2), Some(RiskLevel::Medium));
    assert_eq!(client.get_risk(&wallet3), Some(RiskLevel::High));
}

#[test]
fn test_transfer_admin() {
    let (env, admin, contract_id) = setup();
    env.mock_all_auths();

    let client = LiquidityIdentityClient::new(&env, &contract_id);

    let wallet = Address::generate(&env);
    client.set_score(
        &admin,
        &wallet,
        &70,
        &RiskLevel::Low,
        &dummy_hash(&env, 0x70),
    );

    let new_admin = Address::generate(&env);
    client.transfer_admin(&admin, &new_admin);

    let stored_admin = client.get_admin();
    assert_eq!(stored_admin, new_admin);
}

#[test]
fn test_multiple_wallets() {
    let (env, admin, contract_id) = setup();
    env.mock_all_auths();

    let client = LiquidityIdentityClient::new(&env, &contract_id);

    let wallet1 = Address::generate(&env);
    let wallet2 = Address::generate(&env);
    let wallet3 = Address::generate(&env);

    client.set_score(
        &admin,
        &wallet1,
        &90,
        &RiskLevel::Low,
        &dummy_hash(&env, 0x90),
    );
    client.set_score(
        &admin,
        &wallet2,
        &50,
        &RiskLevel::Medium,
        &dummy_hash(&env, 0x50),
    );
    client.set_score(
        &admin,
        &wallet3,
        &30,
        &RiskLevel::High,
        &dummy_hash(&env, 0x30),
    );

    assert_eq!(client.get_score(&wallet1), 90);
    assert_eq!(client.get_score(&wallet2), 50);
    assert_eq!(client.get_score(&wallet3), 30);
}

#[test]
fn test_last_updated_timestamp() {
    let (env, admin, contract_id) = setup();
    env.mock_all_auths();

    let client = LiquidityIdentityClient::new(&env, &contract_id);

    let wallet = Address::generate(&env);
    client.set_score(
        &admin,
        &wallet,
        &75,
        &RiskLevel::Low,
        &dummy_hash(&env, 0x75),
    );

    let timestamp = client.get_last_updated(&wallet);
    assert!(timestamp.is_some());
}

#[test]
fn test_network_identifier() {
    let (env, _admin, contract_id) = setup();
    env.mock_all_auths();

    let client = LiquidityIdentityClient::new(&env, &contract_id);

    let stored_network = client.get_network();
    assert_eq!(stored_network, symbol_short!("testnet"));
}

#[test]
fn test_get_wallet_info() {
    let (env, admin, contract_id) = setup();
    env.mock_all_auths();

    let client = LiquidityIdentityClient::new(&env, &contract_id);

    let wallet = Address::generate(&env);
    client.set_score(
        &admin,
        &wallet,
        &82,
        &RiskLevel::Low,
        &dummy_hash(&env, 0x82),
    );

    let info = client.get_wallet_info(&wallet);
    assert!(info.is_some());

    let wallet_score = info.unwrap();
    assert_eq!(wallet_score.score, 82);
    assert_eq!(wallet_score.risk, RiskLevel::Low);
}

#[test]
fn test_get_wallet_info_nonexistent() {
    let (env, _admin, contract_id) = setup();
    env.mock_all_auths();

    let client = LiquidityIdentityClient::new(&env, &contract_id);

    let wallet = Address::generate(&env);
    let info = client.get_wallet_info(&wallet);
    assert!(info.is_none());
}

#[test]
fn test_get_verifiable_info() {
    let (env, admin, contract_id) = setup();
    env.mock_all_auths();

    let client = LiquidityIdentityClient::new(&env, &contract_id);

    let wallet = Address::generate(&env);
    let hash = dummy_hash(&env, 0xde);
    client.set_score(&admin, &wallet, &77, &RiskLevel::Medium, &hash);

    // Verify the full verifiable record is stored and returned correctly.
    let record = client.get_verifiable_info(&wallet);
    assert!(record.is_some());

    let v = record.unwrap();
    assert_eq!(v.score, 77);
    assert_eq!(v.risk, RiskLevel::Medium);
    assert_eq!(v.score_input_hash, hash);
    assert_eq!(v.last_updated, env.ledger().timestamp());
}

#[test]
fn test_get_verifiable_info_nonexistent() {
    let (env, _admin, contract_id) = setup();
    env.mock_all_auths();

    let client = LiquidityIdentityClient::new(&env, &contract_id);

    let wallet = Address::generate(&env);
    let record = client.get_verifiable_info(&wallet);
    assert!(record.is_none());
}

#[test]
fn test_get_score_count_starts_at_zero() {
    let (env, _admin, contract_id) = setup();
    env.mock_all_auths();

    let client = LiquidityIdentityClient::new(&env, &contract_id);
    assert_eq!(client.get_score_count(), 0);
}

#[test]
fn test_get_total_wallets_starts_at_zero() {
    let (env, _admin, contract_id) = setup();
    env.mock_all_auths();

    let client = LiquidityIdentityClient::new(&env, &contract_id);
    assert_eq!(client.get_total_wallets(), 0);
}

#[test]
fn test_score_count_increments_on_each_set() {
    let (env, admin, contract_id) = setup();
    env.mock_all_auths();

    let client = LiquidityIdentityClient::new(&env, &contract_id);
    let wallet = Address::generate(&env);

    client.set_score(
        &admin,
        &wallet,
        &50,
        &RiskLevel::Medium,
        &dummy_hash(&env, 0x01),
    );
    assert_eq!(client.get_score_count(), 1);

    // Re-score the same wallet — count increments but total_wallets stays the same.
    client.set_score(
        &admin,
        &wallet,
        &80,
        &RiskLevel::Low,
        &dummy_hash(&env, 0x02),
    );
    assert_eq!(client.get_score_count(), 2);
}

#[test]
fn test_total_wallets_counts_unique_wallets() {
    let (env, admin, contract_id) = setup();
    env.mock_all_auths();

    let client = LiquidityIdentityClient::new(&env, &contract_id);

    let wallet1 = Address::generate(&env);
    let wallet2 = Address::generate(&env);

    client.set_score(
        &admin,
        &wallet1,
        &70,
        &RiskLevel::Low,
        &dummy_hash(&env, 0x10),
    );
    assert_eq!(client.get_total_wallets(), 1);

    client.set_score(
        &admin,
        &wallet2,
        &40,
        &RiskLevel::High,
        &dummy_hash(&env, 0x20),
    );
    assert_eq!(client.get_total_wallets(), 2);

    // Re-score wallet1 — total_wallets should still be 2.
    client.set_score(
        &admin,
        &wallet1,
        &90,
        &RiskLevel::Low,
        &dummy_hash(&env, 0x11),
    );
    assert_eq!(client.get_total_wallets(), 2);
    assert_eq!(client.get_score_count(), 3);
}
