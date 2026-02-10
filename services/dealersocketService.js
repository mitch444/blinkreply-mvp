export function createDealerSocketService(config = {}) {
  const defaults = {
    baseUrl: "",
    apiKey: "",
    timeoutMs: 8000,
    logger: console
  };

  const settings = { ...defaults, ...config };

  async function syncVehicle(vehicle) {
    settings.logger?.info?.("[DealerSocket] syncVehicle stub", vehicle);
    return { ok: true, message: "Stub: syncVehicle not implemented" };
  }

  async function pushLead(vehicleId, customerData) {
    settings.logger?.info?.("[DealerSocket] pushLead stub", { vehicleId, customerData });
    return { ok: true, message: "Stub: pushLead not implemented" };
  }

  async function fetchLeadSummary(vehicleId) {
    settings.logger?.info?.("[DealerSocket] fetchLeadSummary stub", { vehicleId });
    return { ok: true, summary: null };
  }

  async function fetchCRMNotes(vehicleId) {
    settings.logger?.info?.("[DealerSocket] fetchCRMNotes stub", { vehicleId });
    return { ok: true, notes: [] };
  }

  return {
    config: settings,
    syncVehicle,
    pushLead,
    fetchLeadSummary,
    fetchCRMNotes
  };
}

// TODO: Replace with real DealerSocket client when credentials and API are available.
