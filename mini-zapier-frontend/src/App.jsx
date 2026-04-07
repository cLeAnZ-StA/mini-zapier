import { useState } from 'react'

function App() {
  // 1. The React "Memory" (State)
  const [selectedTrigger, setSelectedTrigger] = useState('github_push')
  const [selectedAction, setSelectedAction] = useState('discord_msg')
  const [actionPayload, setActionPayload] = useState('')

  // 2. The Logic to package the data
  const handleSaveRule = async () => {
    const newRule = {
      trigger_source: selectedTrigger,
      action_target: selectedAction,
      action_payload: actionPayload
    }

    console.log("Sending this to backend:", newRule);
    alert(`Rule Saved! When ${selectedTrigger} happens, do ${selectedAction}`);
    
    fetch('http://localhost:3000/save-rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newRule)
    })
    
  }

  // 3. The Visual Interface
  return (
    <div style={{ padding: '40px', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto' }}>
      <h1>⚡ Mini-Zapier Rule Builder</h1>
      
      <div style={{ background: '#f4f4f4', padding: '20px', borderRadius: '8px', marginTop: '20px' }}>
        
        {/* TRIGGER DROPDOWN */}
        <label><b>1. When this happens (Trigger):</b></label>
        <br/>
        <select 
          value={selectedTrigger} 
          onChange={(e) => setSelectedTrigger(e.target.value)}
          style={{ padding: '10px', width: '100%', marginBottom: '20px', marginTop: '10px' }}
        >
          <option value="github_push">A new commit is pushed to GitHub</option>
          <option value="custom_webhook">A custom Webhook URL is pinged</option>
          <option value="esp32_button">My physical ESP32 button is pressed</option>
        </select>

        {/* ACTION DROPDOWN */}
        <label><b>2. Then do this (Action):</b></label>
        <br/>
        <select 
          value={selectedAction} 
          onChange={(e) => setSelectedAction(e.target.value)}
          style={{ padding: '10px', width: '100%', marginBottom: '20px', marginTop: '10px' }}
        >
          <option value="discord_msg">Send a Discord Message</option>
          <option value="telegram_msg">Send a Telegram Message</option>
          <option value="log_to_console">Just log it to the backend console</option>
        </select>

        {/* PAYLOAD INPUT */}
        <label><b>3. Message Payload:</b></label>
        <br/>
        <input 
          type="text" 
          placeholder="e.g., Hello World!" 
          value={actionPayload}
          onChange={(e) => setActionPayload(e.target.value)}
          style={{ padding: '10px', width: '95%', marginBottom: '20px', marginTop: '10px' }}
        />

        {/* SAVE BUTTON */}
        <button 
          onClick={handleSaveRule}
          style={{ padding: '15px 30px', background: 'black', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', width: '100%' }}
        >
          Save Automation Rule
        </button>

      </div>
    </div>
  )
}

export default App