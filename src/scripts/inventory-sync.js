/**
 * @file Inventory synchronization for the AQW account page.
 * @description Fetches the player's full inventory from the AQW account API
 *   and persists it to chrome.storage.local.
 * 
 * @version 3.0.4 - Always syncs on load (no cache)
 */

if (window.location.href.includes("account.aq.com/AQW/Inventory")) {

    // ============================================================
    // FETCH INVENTORY FROM WORKING API
    // ============================================================
    
    async function fetchInventoryFromAPI() {
        console.log("[AQWikiTools] Fetching inventory from API...");
        
        let allItems = [];
        let skip = 0;
        const take = 300;
        let page = 1;
        let hasMore = true;
        let consecutiveErrors = 0;
        
        try {
            while (hasMore && consecutiveErrors < 3) {
                console.log(`[AQWikiTools] Fetching skip=${skip}, take=${take} (page ${page})...`);
                
                try {
                    const response = await fetch(
                        `https://account.aq.com/myapi/inventory/InventoryData?skip=${skip}&take=${take}&requireTotalCount=true&sort=[{"selector":"Added","desc":true}]&_=${Date.now() + page}`,
                        {
                            headers: {
                                "accept": "application/json, text/javascript, */*; q=0.01",
                                "x-requested-with": "XMLHttpRequest"
                            },
                            credentials: "include"
                        }
                    );
                    
                    if (response.status === 500) {
                        console.warn(`[AQWikiTools] Server error 500 at skip=${skip}. Stopping pagination.`);
                        showStatusMessage(`Stopped at ${allItems.length} items (server limit reached)`, "warning");
                        break;
                    }
                    
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    
                    const data = await response.json();
                    
                    if (!data.data || data.data.length === 0) {
                        console.log(`[AQWikiTools] No more items at skip=${skip}`);
                        break;
                    }
                    
                    const processedItems = processAPIData(data.data);
                    allItems.push(...processedItems);
                    console.log(`[AQWikiTools] Page ${page}: ${processedItems.length} items (total: ${allItems.length})`);
                    
                    if (data.totalCount && allItems.length >= data.totalCount) {
                        console.log(`[AQWikiTools] Reached total count: ${data.totalCount}`);
                        break;
                    }
                    
                    if (data.data.length < take) {
                        console.log(`[AQWikiTools] Last page (got ${data.data.length} < ${take})`);
                        break;
                    }
                    
                    skip += take;
                    page++;
                    consecutiveErrors = 0;
                    await new Promise(r => setTimeout(r, 100));
                    
                } catch (fetchError) {
                    consecutiveErrors++;
                    console.error(`[AQWikiTools] Fetch error (attempt ${consecutiveErrors}):`, fetchError);
                    
                    if (consecutiveErrors >= 3) {
                        console.error("[AQWikiTools] Too many consecutive errors, stopping.");
                        showStatusMessage(`Stopped at ${allItems.length} items due to errors`, "error");
                        break;
                    }
                    
                    await new Promise(r => setTimeout(r, 1000));
                }
            }
            
            console.log(`[AQWikiTools] ✅ TOTAL: ${allItems.length} items fetched via API`);
            return allItems;
            
        } catch (error) {
            console.error("[AQWikiTools] Fatal API error:", error);
            throw error;
        }
    }
    
    function processAPIData(data) {
        return data.map(item => {
            let itemName = item.Name || "";
            let quantity = item.Count || 1;
            
            const match = itemName.match(/(.*?)\s+x(\d+)$/i);
            if (match && quantity === 1) {
                itemName = match[1].trim();
                quantity = parseInt(match[2], 10);
            }
            
            return {
                name: itemName,
                quantity: quantity,
                location: item.Bank === 1 ? "Bank" : "Inventory",
                type: item.Type || "",
                currency: item.AC === 1 ? "AC" : "Gold",
                category: item.Member === 1 ? "Member" : "Free",
                rawName: item.Name || "",
                added: item.Added || null
            };
        });
    }
    
    async function saveInventoryToStorage(inventory) {
        return new Promise((resolve) => {
            chrome.storage.local.set({ 
                savedInventory: inventory,
                savedInventoryLastSync: Date.now(),
                savedInventoryCount: inventory.length
            }, () => {
                console.log(`[AQWikiTools] ✅ Saved ${inventory.length} items to storage`);
                resolve();
            });
        });
    }
    
    async function loadInventoryFromStorage() {
        return new Promise((resolve) => {
            chrome.storage.local.get(["savedInventory"], (result) => {
                resolve(result.savedInventory || []);
            });
        });
    }
    
    function showStatusMessage(message, type = "info") {
        let statusDiv = document.getElementById("aqw-sync-status");
        if (!statusDiv) {
            statusDiv = document.createElement("div");
            statusDiv.id = "aqw-sync-status";
            statusDiv.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 10000;
                padding: 10px 20px;
                border-radius: 8px;
                font-size: 13px;
                font-weight: bold;
                font-family: Arial, sans-serif;
                box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                transition: opacity 0.5s ease;
                pointer-events: none;
            `;
            document.body.appendChild(statusDiv);
        }
        
        const colors = {
            success: "#4caf50",
            error: "#f44336",
            warning: "#ff9800",
            info: "#2196f3"
        };
        
        statusDiv.style.backgroundColor = colors[type] || colors.info;
        statusDiv.style.color = "white";
        statusDiv.style.opacity = "1";
        statusDiv.textContent = message;
        
        setTimeout(() => {
            statusDiv.style.opacity = "0";
            setTimeout(() => {
                if (statusDiv.parentNode) statusDiv.remove();
            }, 500);
        }, 4000);
    }
    
    function addSyncButton() {
        const header = document.querySelector(".tblHeader") || document.querySelector("h4");
        if (!header) return;
        
        let syncButton = document.getElementById("aqw-manual-sync-btn");
        if (syncButton) return;
        
        syncButton = document.createElement("button");
        syncButton.id = "aqw-manual-sync-btn";
        syncButton.textContent = "⟳ Sync Inventory";
        syncButton.style.cssText = `
            margin-left: 15px;
            padding: 4px 12px;
            background: #4caf50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
        `;
        syncButton.onclick = async () => {
            syncButton.disabled = true;
            syncButton.textContent = "⟳ Syncing...";
            await synchronizeInventory(true);
            syncButton.disabled = false;
            syncButton.textContent = "⟳ Sync Inventory";
        };
        
        header.appendChild(syncButton);
    }
    
    // ============================================================
    // MAIN SYNC - ALWAYS SYNC (NO CACHE)
    // ============================================================
    
    async function synchronizeInventory(force = false) {
        console.log("[AQWikiTools] 🔄 Starting inventory synchronization (forced refresh)...");
        
        showStatusMessage("Syncing inventory...", "info");
        
        try {
            const inventory = await fetchInventoryFromAPI();
            await saveInventoryToStorage(inventory);
            showStatusMessage(`✅ Synced ${inventory.length} items successfully!`, "success");
            console.log(`[AQWikiTools] ✅ Sync completed: ${inventory.length} items`);
            return inventory;
        } catch (error) {
            console.error("[AQWikiTools] ❌ Sync failed:", error);
            showStatusMessage("❌ Sync failed! Please refresh and try again.", "error");
            
            const cached = await loadInventoryFromStorage();
            if (cached.length > 0) {
                console.log(`[AQWikiTools] Using cached data (${cached.length} items) as fallback`);
                return cached;
            }
            return [];
        }
    }
    
    async function getInventory() {
        const { savedInventory } = await chrome.storage.local.get(["savedInventory"]);
        return savedInventory || [];
    }
    
    // ============================================================
    // INITIALIZE - ALWAYS SYNC ON PAGE LOAD
    // ============================================================
    
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", async () => {
            setTimeout(async () => {
                addSyncButton();
                await synchronizeInventory(true); // ALWAYS SYNC
            }, 2000);
        });
    } else {
        setTimeout(async () => {
            addSyncButton();
            await synchronizeInventory(true); // ALWAYS SYNC
        }, 2000);
    }
    
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { 
            synchronizeInventory, 
            getInventory, 
            fetchInventoryFromAPI
        };
    }
    
    console.log("[AQWikiTools] Inventory sync module loaded (always-sync mode)");
}
