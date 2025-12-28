// Modal functions
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
    document.body.style.overflow = '';
    // Reset form
    const form = modal.querySelector('form');
    if (form) {
      form.reset();
    }
  }
}

// Close modal when clicking outside
window.onclick = function(event) {
  if (event.target.classList.contains('modal')) {
    event.target.classList.remove('active');
    document.body.style.overflow = '';
  }
}

// Specific modal openers
function openInventoryModal() {
  openModal('inventoryModal');
}

function openPickupModal() {
  openModal('pickupModal');
}

function openRequestModal() {
  openModal('requestModal');
}

function openUpdateModal() {
  openModal('updateModal');
  switchUpdateTab('SHELF'); // Reset to SHELF tab
}

// Helper function to generate quantity options for dropdown
function generateQuantityOptions(increment, max = 20) {
  const options = [];
  for (let i = 0; i <= max; i += increment) {
    // Round to avoid floating point precision issues
    const value = Math.round(i * 100) / 100;
    options.push(value);
  }
  return options;
}

// Update modal tab switching
function switchUpdateTab(location) {
  const updateLocationInput = document.getElementById('updateLocation');
  const updateChemicalList = document.getElementById('updateChemicalList');
  const tabButtons = document.querySelectorAll('#updateModal .tab-button');

  // Update tab buttons - activate the one matching the location
  tabButtons.forEach(btn => {
    btn.classList.remove('active');
    if (btn.dataset.location === location) {
      btn.classList.add('active');
    }
  });

  // Update hidden location input
  if (updateLocationInput) {
    updateLocationInput.value = location;
  }

  // Populate chemical list for the selected location (maintaining order)
  if (updateChemicalList && window.chemicalsData) {
    updateChemicalList.innerHTML = '';
    
    // Define custom order for chemicals (same as server-side)
    const chemicalOrder = [
      'Clean', 'Nova', 'Silk', 'EZ Polish Red', 'Low PH Shampoo',
      'Prizm Red', 'Prizm Blue', 'Prizm Gold',
      'Clean and Fresh Blast', 'Tire Shine', 'Road Rage', 'Bubblicious',
      'Glass Cleaner', 'RLC',
      'Air Freshener - Black Ice', 'Air Freshener - New Car',
      'Air Freshener - Berry Blast', 'Air Freshener - Pina Colada',
      'Air Freshener - Cool Water',
      'Bottles', 'Bottle Triggers',
    ];
    
    const orderMap = new Map();
    chemicalOrder.forEach((name, index) => {
      orderMap.set(name, index);
    });

    // Sort chemicals by custom order
    const sortedChemicals = [...window.chemicalsData].sort((a, b) => {
      const orderA = orderMap.get(a.name);
      const orderB = orderMap.get(b.name);
      if (orderA !== undefined && orderB !== undefined) return orderA - orderB;
      if (orderA !== undefined) return -1;
      if (orderB !== undefined) return 1;
      return a.name.localeCompare(b.name);
    });
    
    // Filter to only chemicals allowed for this location
    const allowedChemicals = sortedChemicals.filter(chemical => {
      return location === 'SHELF' ? chemical.trackOnShelf : chemical.trackOnLine;
    });
    
    allowedChemicals.forEach((chemical, index) => {
      const increment = location === 'SHELF' 
        ? (chemical.shelfIncrement || chemical.increment)
        : (chemical.lineIncrement || chemical.increment);
      
      // Special case: BUCKET chemicals use 0.25 for line
      const actualIncrement = (chemical.unit === 'BUCKET' && location === 'LINE') 
        ? 0.25 
        : increment;

      const qtyOptions = generateQuantityOptions(actualIncrement);
      const optionsHtml = qtyOptions.map(qty => 
        `<option value="${qty}">${qty}</option>`
      ).join('');

      const itemDiv = document.createElement('div');
      itemDiv.className = 'chemical-item';
      itemDiv.setAttribute('data-chemical-id', chemical.id);
      
      itemDiv.innerHTML = `
        <div class="chemical-name">${chemical.name}</div>
        <div class="chemical-inputs">
          <div class="form-group">
            <label>Quantity</label>
            <select 
              class="update-qty" 
              name="updates[${chemical.id}][qty]"
              data-chemical-id="${chemical.id}"
            >
              <option value="">--</option>
              ${optionsHtml}
            </select>
          </div>
        </div>
      `;
      
      updateChemicalList.appendChild(itemDiv);
      
      // Add separator after: Prizm Gold, RLC, Air Freshener - Cool Water
      const separatorAfter = ['Prizm Gold', 'RLC', 'Air Freshener - Cool Water'];
      if (separatorAfter.includes(chemical.name) && index < allowedChemicals.length - 1) {
        const separatorDiv = document.createElement('div');
        separatorDiv.className = 'chemical-separator';
        updateChemicalList.appendChild(separatorDiv);
      }
    });
  }
}

// Open fulfill request modal
function openFulfillModal() {
  const modal = document.getElementById('fulfillModal');
  const content = document.getElementById('fulfillContent');
  
  content.innerHTML = '<p>Loading request details...</p>';
  openModal('fulfillModal');
  
  Promise.all([
    fetch('/requests/open').then(res => res.json()),
    Promise.resolve(window.chemicalsData || [])
  ])
    .then(([requestData, allChemicals]) => {
      if (requestData.batchId === null) {
        content.innerHTML = '<p>No open requests found.</p>';
        return;
      }
      
      const requestedChemicalIds = new Set(requestData.items.map(item => item.chemicalId));
      const requestedItems = requestData.items || [];
      const otherChemicals = (allChemicals || []).filter(chem => !requestedChemicalIds.has(chem.id));
      
      let html = `<form id="fulfillForm">
        <div class="chemical-list">`;
      
      // Render requested items
      if (requestedItems.length > 0) {
        html += '<h4 style="color: #cc3333; margin-bottom: 15px;">Requested Items</h4>';
      requestedItems.forEach(item => {
        // For requested items, allow up to 15 but use the item's increment
        const maxQty = 15;
        const increment = item.increment || 1;
        const options = [];
        for (let qty = 0; qty <= maxQty; qty += increment) {
          options.push(qty);
        }
        const optionsHtml = options.map(qty => `<option value="${qty}">${qty}</option>`).join('');
        
        // Truncate chemical name to 13 chars
        const displayName = item.chemicalName.length > 13 
          ? item.chemicalName.substring(0, 13) + '...' 
          : item.chemicalName;
        
        html += `
          <div class="chemical-item">
            <div class="chemical-name-row">
              <span class="chemical-name">${displayName}</span>
              <span class="requested-qty">Requested: ${item.requestedQty}</span>
            </div>
            <div class="chemical-inputs">
              <div class="form-group">
                <label>Picking up:</label>
                <select class="fulfill-qty" data-chemical-id="${item.chemicalId}" name="qty">
                  ${optionsHtml}
                </select>
              </div>
            </div>
          </div>
        `;
      });
      }
      
      // Render other chemicals
      if (otherChemicals.length > 0) {
        html += '<h4 style="color: #cc3333; margin-top: 30px; margin-bottom: 15px;">Additional Items</h4>';
        otherChemicals.forEach(chemical => {
          // Use whole quantities (1.0 increment) for additional pickups
          const increment = 1.0;
          const maxQty = 15;
          const options = [];
          for (let qty = 0; qty <= maxQty; qty += increment) {
            options.push(qty);
          }
          const optionsHtml = options.map(qty => `<option value="${qty}">${qty}</option>`).join('');
          
          // Truncate chemical name to 13 chars
          const displayName = chemical.name.length > 13 
            ? chemical.name.substring(0, 13) + '...' 
            : chemical.name;
          
          html += `
            <div class="chemical-item">
              <div class="chemical-name-row">
                <span class="chemical-name">${displayName}</span>
              </div>
              <div class="chemical-inputs">
                <div class="form-group">
                  <label>Picking up:</label>
                  <select class="fulfill-qty-additional" data-chemical-id="${chemical.id}" name="qty">
                    ${optionsHtml}
                  </select>
                </div>
              </div>
            </div>
          `;
        });
      }
      
      html += `
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal('fulfillModal')">Cancel</button>
          <button type="submit" class="btn btn-primary">Fulfill Request</button>
        </div>
        <input type="hidden" name="batchId" value="${requestData.batchId}">
      </form>`;
      
      content.innerHTML = html;
      
      // Store batchId for use in submit handler
      const batchId = requestData.batchId;
      
      // Handle form submission
      const fulfillForm = document.getElementById('fulfillForm');
      if (fulfillForm) {
        fulfillForm.addEventListener('submit', function(e) {
          e.preventDefault();
          
          const pickups = [];
          const selects = content.querySelectorAll('.fulfill-qty, .fulfill-qty-additional');
          selects.forEach(select => {
            const qty = parseFloat(select.value) || 0;
            if (qty > 0) {
              pickups.push({
                chemicalId: select.dataset.chemicalId,
                qty: qty,
              });
            }
          });
          
          fetch('/requests/fulfill', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              batchId: batchId,
              pickups: pickups,
            }),
          })
          .then(res => res.json())
          .then(result => {
            if (result.ok) {
              window.location.reload();
            } else {
              alert('Error: ' + (result.error || 'Failed to fulfill request'));
            }
          })
          .catch(err => {
            alert('Error: ' + err.message);
          });
        });
      }
    })
    .catch(err => {
      content.innerHTML = '<p>Error loading request: ' + err.message + '</p>';
    });
}

// Open log detail modal
function openLogDetailModal(logId) {
  const modal = document.getElementById('logDetailModal');
  const content = document.getElementById('logDetailContent');
  
  content.innerHTML = '<p>Loading details...</p>';
  openModal('logDetailModal');
  
  fetch(`/log/${logId}`)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        content.innerHTML = '<p>Error: ' + data.error + '</p>';
        return;
      }
      
      let html = '<div class="log-detail">';
      html += `<p><strong>Type:</strong> ${data.type}</p>`;
      html += `<p><strong>Chemical:</strong> ${data.chemicalName}</p>`;
      
      if (data.location) {
        const locationText = data.location === 'SHELF' ? 'On the Shelf' : 'On the Line';
        html += `<p><strong>Location:</strong> ${locationText}</p>`;
      }
      if (data.setQty != null && data.setQty > 0) {
        html += `<p><strong>Set Quantity:</strong> ${data.setQty}</p>`;
      }
      if (data.addQty != null && data.addQty > 0) {
        html += `<p><strong>Added Quantity:</strong> ${data.addQty}</p>`;
      }
      if (data.requestQty != null && data.requestQty > 0) {
        html += `<p><strong>Requested Quantity:</strong> ${data.requestQty}</p>`;
      }
      if (data.note) {
        html += `<p><strong>Note:</strong> ${data.note}</p>`;
        
        // Check if this is a RequestBatch reference
        if (data.note.startsWith('RequestBatch:')) {
          const batchId = data.note.split('RequestBatch:')[1].split(' ')[0];
          html += `<p><button onclick="loadRequestBatchDetails('${batchId}')" class="btn btn-secondary">View Request Details</button></p>`;
          html += `<div id="batchDetails-${batchId}"></div>`;
        }
      }
      if (data.createdBy) {
        html += `<p><strong>Created By:</strong> ${data.createdBy}</p>`;
      }
      html += `<p><strong>Date:</strong> ${new Date(data.createdAt).toLocaleString()}</p>`;
      html += '</div>';
      
      content.innerHTML = html;
    })
    .catch(err => {
      content.innerHTML = '<p>Error loading log: ' + err.message + '</p>';
    });
}

// Load request batch details
function loadRequestBatchDetails(batchId) {
  const container = document.getElementById(`batchDetails-${batchId}`);
  if (!container) return;
  
  container.innerHTML = '<p>Loading request batch details...</p>';
  
  fetch(`/requests/${batchId}`)
    .then(res => res.json())
    .then(data => {
      if (data.error) {
        container.innerHTML = '<p>Error: ' + data.error + '</p>';
        return;
      }
      
      let html = '<div class="request-batch-details"><h4>Request Batch Details</h4>';
      html += `<p><strong>Status:</strong> ${data.status}</p>`;
      html += `<p><strong>Created:</strong> ${new Date(data.createdAt).toLocaleString()}</p>`;
      if (data.fulfilledAt) {
        html += `<p><strong>Fulfilled:</strong> ${new Date(data.fulfilledAt).toLocaleString()}</p>`;
      }
      if (data.note) {
        html += `<p><strong>Note:</strong> ${data.note}</p>`;
      }
      
      if (data.items && data.items.length > 0) {
        html += '<h5>Items:</h5><ul>';
        data.items.forEach(item => {
          if (item.requestedQty > 0) {
            html += `<li>${item.chemicalName}: Requested ${item.requestedQty}`;
            if (item.pickedUpQty > 0) {
              html += `, Picked up ${item.pickedUpQty}`;
            }
            html += '</li>';
          }
        });
        html += '</ul>';
      }
      
      html += '</div>';
      container.innerHTML = html;
    })
    .catch(err => {
      container.innerHTML = '<p>Error loading batch details: ' + err.message + '</p>';
    });
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
  // Pickup modal doesn't have location dropdown - always goes to shelf

  // Handle request form submission (convert to items array)
  const requestForm = document.getElementById('requestForm');
  if (requestForm) {
    requestForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      const items = [];
      const inputs = requestForm.querySelectorAll('.request-qty');
      inputs.forEach(input => {
        const qty = parseFloat(input.value) || 0;
        if (qty > 0) {
          items.push({
            chemicalId: input.dataset.chemicalId,
            qty: qty,
          });
        }
      });
      
      if (items.length === 0) {
        alert('Please request at least one item with quantity > 0');
        return;
      }
      
      // Submit as JSON
      fetch('/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: items,
          note: document.getElementById('requestNote').value || '',
        }),
      })
      .then(res => {
        if (res.ok) {
          window.location.reload();
        } else {
          return res.json().then(data => {
            alert('Error: ' + (data.error || 'Failed to create request'));
          });
        }
      })
      .catch(err => {
        alert('Error: ' + err.message);
      });
    });
  }

  // Initialize update modal tabs
  const updateModal = document.getElementById('updateModal');
  if (updateModal) {
    const tabButtons = updateModal.querySelectorAll('.tab-button');
    tabButtons.forEach(btn => {
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        const location = this.dataset.location;
        if (location) {
          switchUpdateTab(location);
        }
      });
    });
  }
});
