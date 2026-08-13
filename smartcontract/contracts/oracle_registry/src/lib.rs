#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

#[contracttype]
pub enum DataKey {
    Admin,
    AuthorizedOracle(Address),
}

#[contract]
pub struct OracleRegistry;

#[contractimpl]
impl OracleRegistry {
    /// Initialize the registry with an admin
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("Already initialized");
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    /// Add an authorized oracle (only admin)
    pub fn add_oracle(env: Env, admin: Address, oracle: Address) {
        admin.require_auth();
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic!("Not initialized"));
        if admin != stored_admin {
            panic!("Unauthorized");
        }
        env.storage()
            .persistent()
            .set(&DataKey::AuthorizedOracle(oracle), &true);
    }

    /// Remove an authorized oracle (only admin)
    pub fn remove_oracle(env: Env, admin: Address, oracle: Address) {
        admin.require_auth();
        let stored_admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic!("Not initialized"));
        if admin != stored_admin {
            panic!("Unauthorized");
        }
        env.storage()
            .persistent()
            .remove(&DataKey::AuthorizedOracle(oracle));
    }

    /// Check if an oracle is authorized
    pub fn is_oracle_authorized(env: Env, oracle: Address) -> bool {
        env.storage()
            .persistent()
            .get(&DataKey::AuthorizedOracle(oracle))
            .unwrap_or(false)
    }
}

mod test;
