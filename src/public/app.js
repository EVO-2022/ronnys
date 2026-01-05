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

// Toggle note field visibility
function toggleNoteField(noteGroupId) {
  const noteGroup = document.getElementById(noteGroupId);
  if (noteGroup) {
    noteGroup.style.display = noteGroup.style.display === 'none' ? 'block' : 'none';
  }
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
      // Determine if this chemical tracks in gallons or boxes
      const usesGallons = chemical.gallonsPerUnit != null;
      const step = usesGallons ? '0.1' : (chemical.increment || 1).toString();
      const placeholder = usesGallons ? 'Gallons' : 'Boxes';

      const itemDiv = document.createElement('div');
      itemDiv.className = 'chemical-item';
      itemDiv.setAttribute('data-chemical-id', chemical.id);

      itemDiv.innerHTML = `
        <div class="chemical-name">${chemical.name}</div>
        <div class="chemical-inputs">
          <div class="form-group">
            <label>Quantity</label>
            <input
              type="number"
              class="update-qty"
              name="updates[${chemical.id}][qty]"
              data-chemical-id="${chemical.id}"
              placeholder="${placeholder}"
              step="${step}"
              min="0"
            />
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

      let html = `<form id="fulfillForm">`;

      // Show request note at the top if it exists
      if (requestData.note && requestData.note.trim() !== '') {
        html += `
          <div class="request-note-display">
            <div class="request-note-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
            </div>
            <div class="request-note-content">
              <div class="request-note-label">Request Note:</div>
              <div class="request-note-text">${requestData.note}</div>
            </div>
          </div>
        `;
      }

      html += `<div class="chemical-list">`;

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
        <div class="form-group" id="fulfillNoteGroup" style="display: none;">
          <label>Note (optional)</label>
          <input type="text" id="fulfillNote" name="note">
        </div>
        <div class="form-actions">
          <button type="button" class="btn-icon" onclick="toggleNoteField('fulfillNoteGroup')" title="Add note">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
              <polyline points="10 9 9 9 8 9"></polyline>
            </svg>
          </button>
          <div class="form-actions-buttons">
            <button type="button" class="btn btn-secondary" onclick="closeModal('fulfillModal')">Cancel</button>
            <button type="submit" class="btn btn-primary">Fulfill Request</button>
          </div>
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
          
          const fulfillNoteInput = document.getElementById('fulfillNote');
          const fulfillNote = fulfillNoteInput ? fulfillNoteInput.value : '';
          
          fetch('/requests/fulfill', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              batchId: batchId,
              pickups: pickups,
              note: fulfillNote || undefined,
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
      const selects = requestForm.querySelectorAll('.request-qty');
      selects.forEach(select => {
        const qty = parseFloat(select.value) || 0;
        if (qty > 0) {
          items.push({
            chemicalId: select.dataset.chemicalId,
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
