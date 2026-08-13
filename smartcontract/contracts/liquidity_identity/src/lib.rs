#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, BytesN, Env, Symbol, Vec};

#[contracttype]
pub enum DataKey {
    Admin,
    Network,
    OracleRegistryId,
    Score(Address),
    LastUpdated(Address),
    RiskLevel(Address),
    ScoreInputHash(Address),
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
#[contracttype]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}

#[contracttype]
pub struct WalletScore {
    pub score: u32,
    pub risk: RiskLevel,
    pub last_updated: u64,
}

/// Full verifiable record returned by get_verifiable_info.
/// score_input_hash is a SHA-256 hex digest (as Bytes) of the canonical
/// scoring inputs (accountId:txCount:inflowVolume:outflowVolume:xlmPrice)
/// that the backend hashed before storing. Callers can recompute and compare.
#[contracttype]
pub struct VerifiableWalletScore {
    pub score: u32,
    pub risk: RiskLevel,
    pub last_updated: u64,
    pub score_input_hash: BytesN<32>,
}

#[contract]
pub struct LiquidityIdentity;

#[contractimpl]
impl LiquidityIdentity {
    pub fn init(env: Env, admin: Address, network: Symbol) {
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Network, &network);
    }

    /// Set the Oracle Registry Contract ID
    pub fn set_oracle_registry(env: Env, admin: Address, registry_id: Address) {
        admin.require_auth();
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic!("Admin not set"));
        if admin != stored_admin {
            panic!("Unauthorized");
        }
        env.storage()
            .instance()
            .set(&DataKey::OracleRegistryId, &registry_id);
    }

    /// Store a score on-chain. Requires authorization from the OracleRegistry.
    pub fn set_score(
        env: Env,
        caller: Address,
        wallet: Address,
        score: u32,
        risk: RiskLevel,
        score_input_hash: BytesN<32>,
    ) {
        caller.require_auth();

        // Cross-contract call to OracleRegistry to check authorization
        let registry_id: Address = env
            .storage()
            .instance()
            .get(&DataKey::OracleRegistryId)
            .unwrap_or_else(|| panic!("OracleRegistry not configured"));

        let is_authorized: bool = env.invoke_contract(
            &registry_id,
            &soroban_sdk::Symbol::new(&env, "is_oracle_authorized"),
            soroban_sdk::vec![&env, caller.to_val()],
        );

        if !is_authorized {
            panic!("Unauthorized: caller is not an authorized oracle");
        }

        if score > 100 {
            panic!("Score must be between 0 and 100");
        }

        let timestamp = env.ledger().timestamp();

        env.storage()
            .persistent()
            .set(&DataKey::Score(wallet.clone()), &score);
        env.storage()
            .persistent()
            .set(&DataKey::RiskLevel(wallet.clone()), &risk);
        env.storage()
            .persistent()
            .set(&DataKey::LastUpdated(wallet.clone()), &timestamp);
        // Fix 1: persist the input hash for trustless verification.
        env.storage()
            .persistent()
            .set(&DataKey::ScoreInputHash(wallet.clone()), &score_input_hash);

        // Emit a ScoreSet event so off-chain indexers and users can observe
        // every score update without trusting the admin.
        env.events().publish(
            (Symbol::new(&env, "score_set"), wallet.clone()),
            (score, risk, timestamp, score_input_hash.clone()),
        );
    }

    pub fn get_score(env: Env, wallet: Address) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::Score(wallet))
            .unwrap_or(0)
    }

    pub fn get_risk(env: Env, wallet: Address) -> Option<RiskLevel> {
        env.storage().persistent().get(&DataKey::RiskLevel(wallet))
    }

    pub fn get_wallet_info(env: Env, wallet: Address) -> Option<WalletScore> {
        let score: Option<u32> = env
            .storage()
            .persistent()
            .get(&DataKey::Score(wallet.clone()));
        let risk: Option<RiskLevel> = env
            .storage()
            .persistent()
            .get(&DataKey::RiskLevel(wallet.clone()));
        let last_updated: Option<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::LastUpdated(wallet));

        match (score, risk, last_updated) {
            (Some(s), Some(r), Some(t)) => Some(WalletScore {
                score: s,
                risk: r,
                last_updated: t,
            }),
            _ => None,
        }
    }

    /// Fix 1: returns the full verifiable record including the score_input_hash.
    /// Third parties can independently verify by re-computing:
    ///   SHA-256("{wallet}:{tx_count}:{inflow_volume}:{outflow_volume}:{xlm_price_usd}")
    /// and comparing against the stored hash.
    pub fn get_verifiable_info(env: Env, wallet: Address) -> Option<VerifiableWalletScore> {
        let score: Option<u32> = env
            .storage()
            .persistent()
            .get(&DataKey::Score(wallet.clone()));
        let risk: Option<RiskLevel> = env
            .storage()
            .persistent()
            .get(&DataKey::RiskLevel(wallet.clone()));
        let last_updated: Option<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::LastUpdated(wallet.clone()));
        let score_input_hash: Option<BytesN<32>> = env
            .storage()
            .persistent()
            .get(&DataKey::ScoreInputHash(wallet));

        match (score, risk, last_updated, score_input_hash) {
            (Some(s), Some(r), Some(t), Some(h)) => Some(VerifiableWalletScore {
                score: s,
                risk: r,
                last_updated: t,
                score_input_hash: h,
            }),
            _ => None,
        }
    }

    pub fn get_last_updated(env: Env, wallet: Address) -> Option<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::LastUpdated(wallet))
    }

    pub fn get_admin(env: Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic!("Admin not set"))
    }

    pub fn get_network(env: Env) -> Symbol {
        env.storage()
            .instance()
            .get(&DataKey::Network)
            .unwrap_or_else(|| panic!("Network not set"))
    }

    pub fn transfer_admin(env: Env, admin: Address, new_admin: Address) {
        admin.require_auth();

        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic!("Admin not set"));

        if admin != stored_admin {
            panic!("Unauthorized: only current admin can transfer");
        }

        env.storage().instance().set(&DataKey::Admin, &new_admin);
    }

    pub fn get_all_wallets_with_scores(env: Env, wallets: Vec<Address>) -> Vec<WalletScore> {
        let mut results: Vec<WalletScore> = Vec::new(&env);

        for wallet in wallets.iter() {
            if let Some(info) = Self::get_wallet_info(env.clone(), wallet.clone()) {
                results.push_back(info);
            }
        }

        results
    }
}

mod test;
