document.addEventListener('DOMContentLoaded', function() {
  // Existing variables
  let bearerToken = localStorage.getItem('claude_bearer_token');
  let currentChatId = null;
  let imageFile = null;
  let selectedModel = 'claude-3-5-sonnet-latest';
  
  // DOM elements
  const chatContainer = document.getElementById('chatContainer');
  const userInput = document.getElementById('userInput');
  const sendButton = document.getElementById('sendButton');
  const statusInfo = document.getElementById('statusInfo');
  const newChatButton = document.getElementById('newChatButton');
  const newAccountButton = document.getElementById('newAccountButton');
  const imageUpload = document.getElementById('imageUpload');
  const imagePreviewContainer = document.getElementById('imagePreviewContainer');
  const chatHistoryList = document.getElementById('chatHistoryList');
  const chatTitle = document.getElementById('chatTitle');
  const modelSelector = document.getElementById('modelSelector');
  const reasoningModeToggle = document.getElementById('reasoningModeToggle');
  const headerAiAvatar = document.getElementById('headerAiAvatar');
  const customGptIndicator = document.getElementById('customGptIndicator');
  const sidebar = document.querySelector('.sidebar');
  const sidebarToggleButton = document.getElementById('sidebarToggleButton');

  // GPT Store DOM Elements
  const gptStoreButton = document.getElementById('gptStoreButton');
  const gptStoreModal = document.getElementById('gptStoreModal');
  const closeGptStoreModalButton = document.getElementById('closeGptStoreModalButton');
  const openCreateGptFormButton = document.getElementById('openCreateGptFormButton');
  const communityGptList = document.getElementById('communityGptList');

  // Create GPT Modal DOM Elements
  const createGptModal = document.getElementById('createGptModal');
  const createGptModalTitle = document.getElementById('createGptModalTitle');
  const closeCreateGptModalButton = document.getElementById('closeCreateGptModalButton');
  const gptNameInput = document.getElementById('gptNameInput');
  const improveGptNameButton = document.getElementById('improveGptNameButton');
  const gptDescriptionInput = document.getElementById('gptDescriptionInput');
  const improveGptDescriptionButton = document.getElementById('improveGptDescriptionButton');
  const gptSystemPromptInput = document.getElementById('gptSystemPromptInput');
  const improveGptSystemPromptButton = document.getElementById('improveGptSystemPromptButton');
  const gptModelSelector = document.getElementById('gptModelSelector');
  const generateGptLogoButton = document.getElementById('generateGptLogoButton');
  const gptLogoPreview = document.getElementById('gptLogoPreview');
  const gptLogoUrlInput = document.getElementById('gptLogoUrlInput');
  const saveGptButton = document.getElementById('saveGptButton');
  const gptFormStatus = document.getElementById('gptFormStatus');
  
  let reasoningModeActive = false;
  const CONTINUE_REASONING_TOKEN = "[CONTINUE_REASONING]";
  const END_REASONING_TOKEN = "[END_REASONING]";
  const MAX_REASONING_STEPS = 10;

  let chatHistory = JSON.parse(localStorage.getItem('chat_history') || '{}');
  let chats = JSON.parse(localStorage.getItem('chats') || '{}');
  
  const room = new WebsimSocket(); // Initialize WebsimSocket
  let communityGpts = [];
  let activeCustomGpt = null; // To store the currently selected custom GPT config
  const CUSTOM_GPT_COLLECTION_NAME = 'custom_gpt_v1';

  const katexOptions = {
    delimiters: [
      {left: "$$", right: "$$", display: true},
      {left: "$", right: "$", display: false},
      {left: "\\[", right: "\\]", display: true},
      {left: "\\(", right: "\\)", display: false}
    ],
    throwOnError: false
  };
  
  if (window.feather) {
    feather.replace();
  }

  const renderer = new marked.Renderer();
  // Override block code renderer to embed hljs class for styling, avoid undefined languages
  renderer.code = function(code, infostring, escaped) {
    const lang = (infostring || '').trim().split(/\s+/)[0];
    const validLang = lang && hljs.getLanguage && hljs.getLanguage(lang) ? lang : '';
    const escapedCode = escaped ? code : escapeHtml(code);
    // always include 'hljs' for CSS styling; only add 'language-xyz' if supported
    const classAttr = `hljs${validLang ? ' language-' + validLang : ''}`;
    return `<div class="code-block-wrapper">
              <pre><code class="${classAttr}">${escapedCode}</code></pre>
              <button class="copy-button" onclick="copyToClipboard(this)">Copy</button>
            </div>`;
  };

  marked.setOptions({
    renderer: renderer,
    highlight: (code, lang) => {
      const language = lang && hljs.getLanguage(lang) ? lang : '';
      return language
        ? hljs.highlight(code, { language }).value
        : escapeHtml(code);
    },
    gfm: true,
    breaks: true,
    mangle: false,
    headerIds: false,
  });
  
  // Event listeners
  sendButton.addEventListener('click', sendMessage);
  userInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  
  userInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
    if (this.scrollHeight > 200) { this.style.overflowY = 'auto'; } 
    else { this.style.overflowY = 'hidden'; }
  });
  
  newChatButton.addEventListener('click', function() {
    activeCustomGpt = null; // Ensure new chat starts as default
    updateChatUIForCustomGpt(); // Reset UI
    createNewChat();
  });
  
  newAccountButton.addEventListener('click', function() {
    makeRequest().catch(err => console.error("Manual account creation failed:", err));
  });
  
  imageUpload.addEventListener('change', handleImageUpload);
  
  modelSelector.addEventListener('change', function() {
    selectedModel = this.value;
    localStorage.setItem('selected_model', selectedModel);
    if (activeCustomGpt) { // If user changes main model selector, deactivate custom GPT
        activeCustomGpt = null;
        updateChatUIForCustomGpt();
        // Optionally, start a new chat or inform the user
        createNewChat(); // Start a new default chat with the selected model
    }
  });

  reasoningModeToggle.addEventListener('click', () => {
    reasoningModeActive = !reasoningModeActive;
    reasoningModeToggle.setAttribute('aria-pressed', reasoningModeActive.toString());
    reasoningModeToggle.textContent = reasoningModeActive ? 'ON' : 'OFF';
    localStorage.setItem('reasoning_mode_active', reasoningModeActive.toString());
  });

  // GPT Store Listeners
  gptStoreButton.addEventListener('click', openGptStore);
  closeGptStoreModalButton.addEventListener('click', closeGptStore);
  openCreateGptFormButton.addEventListener('click', () => {
    closeGptStore(); // Close store modal
    openCreateGptModal(); // Open create modal
  });

  // Create GPT Modal Listeners
  closeCreateGptModalButton.addEventListener('click', closeCreateGptModal);
  improveGptNameButton.addEventListener('click', () => handleImproveText('name', gptNameInput, improveGptNameButton));
  improveGptDescriptionButton.addEventListener('click', () => handleImproveText('description', gptDescriptionInput, improveGptDescriptionButton));
  improveGptSystemPromptButton.addEventListener('click', () => handleImproveText('system prompt', gptSystemPromptInput, improveGptSystemPromptButton));
  generateGptLogoButton.addEventListener('click', handleGenerateLogo);
  saveGptButton.addEventListener('click', handleSaveGpt);

  if (sidebarToggleButton && sidebar) {
    sidebarToggleButton.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });
  }

  // Close sidebar when clicking outside of it on mobile
  document.addEventListener('click', function(event) {
    if (sidebar && sidebar.classList.contains('open') && window.innerWidth <= 768) {
        const isClickInsideSidebar = sidebar.contains(event.target);
        const isClickOnToggleButton = sidebarToggleButton.contains(event.target);
        if (!isClickInsideSidebar && !isClickOnToggleButton) {
            sidebar.classList.remove('open');
        }
    }
  });

  async function initializeApp() {
    await room.initialize();
    console.log("WebsimSocket initialized.");

    room.collection(CUSTOM_GPT_COLLECTION_NAME).subscribe(gpts => {
        communityGpts = gpts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        if (gptStoreModal.style.display === 'block') {
            renderCommunityGpts();
        }
    });
    communityGpts = room.collection(CUSTOM_GPT_COLLECTION_NAME).getList().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    initializeChat();
    await loadModels(); // Ensure models are loaded before populating GPT creator model selector
    populateGptModelSelector(); // Populate the model selector in the GPT creation form

    newAccountButton.style.display = 'none';
    
    const savedModel = localStorage.getItem('selected_model');
    if (savedModel) selectedModel = savedModel;

    const savedReasoningMode = localStorage.getItem('reasoning_mode_active');
    if (savedReasoningMode === 'true') {
      reasoningModeActive = true;
      reasoningModeToggle.setAttribute('aria-pressed', 'true');
      reasoningModeToggle.textContent = 'ON';
    }

    if (!bearerToken) {
      makeRequest().catch(err => console.error("Initial account creation failed:", err));
    } else {
      statusInfo.innerHTML = '<p>Using existing account. Chat is ready.</p>';
      checkUsage();
    }
  }
  
  initializeApp();

  // --- GPT Store Functions ---
  function openGptStore() {
    gptStoreModal.style.display = 'block';
    renderCommunityGpts();
  }

  function closeGptStore() {
    gptStoreModal.style.display = 'none';
  }
  
  function renderCommunityGpts() {
    communityGptList.innerHTML = '';
    if (communityGpts.length === 0) {
      communityGptList.innerHTML = '<p>No community GPTs found yet. Be the first to create one!</p>';
      return;
    }

    communityGpts.forEach(gpt => {
      const item = document.createElement('div');
      item.className = 'gpt-list-item';
      item.innerHTML = `
        <img src="${gpt.logoUrl || 'ai-logo.png'}" alt="${gpt.name} logo">
        <div class="gpt-item-info">
          <h4>${escapeHtml(gpt.name)}</h4>
          <p>${escapeHtml(gpt.description.substring(0, 100))}${gpt.description.length > 100 ? '...' : ''}</p>
          <p class="creator">By: ${escapeHtml(gpt.username)}</p>
        </div>
        <button class="button-secondary use-gpt-button" data-gpt-id="${gpt.id}">Use GPT</button>
      `;
      item.querySelector('.use-gpt-button').addEventListener('click', () => {
        const selectedGpt = communityGpts.find(g => g.id === gpt.id);
        if (selectedGpt) {
            activeCustomGpt = selectedGpt;
            updateChatUIForCustomGpt();
            closeGptStore();
            createNewChat(); // This will now use activeCustomGpt settings
        }
      });
      communityGptList.appendChild(item);
    });
  }

  // --- Create GPT Modal Functions ---
  function openCreateGptModal() {
    createGptModalTitle.textContent = 'Create New GPT';
    gptNameInput.value = '';
    gptDescriptionInput.value = '';
    gptSystemPromptInput.value = '';
    gptLogoPreview.src = 'ai-logo.png'; // Default logo
    gptLogoUrlInput.value = 'ai-logo.png';
    if (gptModelSelector.options.length > 0) {
        gptModelSelector.value = gptModelSelector.options[0].value;
    }
    gptFormStatus.textContent = '';
    saveGptButton.disabled = false;
    createGptModal.style.display = 'block';
  }

  function closeCreateGptModal() {
    createGptModal.style.display = 'none';
  }

  async function handleImproveText(fieldType, inputElement, buttonElement) {
    const originalText = inputElement.value.trim();
    if (!originalText) {
      alert(`Please enter some text for the ${fieldType} first.`);
      return;
    }
    buttonElement.disabled = true;
    buttonElement.textContent = 'Improving...';
    gptFormStatus.textContent = `Improving ${fieldType}...`;
    try {
      const completion = await websim.chat.completions.create({
        messages: [
          { role: "system", content: `You are an AI assistant that helps refine content for custom GPTs. Given the text and its context (${fieldType}), improve it to be more effective, clear, and engaging. Respond directly with only the improved text, without any surrounding quotes or explanations.` },
          { role: "user", content: `Context: ${fieldType}\nText to improve: ${originalText}` }
        ]
      });
      inputElement.value = completion.content.trim();
      gptFormStatus.textContent = `${fieldType.charAt(0).toUpperCase() + fieldType.slice(1)} improved!`;
    } catch (error) {
      console.error(`Error improving ${fieldType}:`, error);
      gptFormStatus.textContent = `Error improving ${fieldType}: ${error.message}`;
      gptFormStatus.className = 'form-status error';
    } finally {
      buttonElement.disabled = false;
      buttonElement.textContent = 'Improve';
       setTimeout(() => { gptFormStatus.textContent = ''; gptFormStatus.className = 'form-status';}, 3000);
    }
  }

  async function handleGenerateLogo() {
    const name = gptNameInput.value.trim();
    const description = gptDescriptionInput.value.trim();
    if (!name && !description) {
      alert('Please enter a name or description to generate a logo.');
      return;
    }
    
    generateGptLogoButton.disabled = true;
    generateGptLogoButton.textContent = 'Generating...';
    gptFormStatus.textContent = 'Generating logo...';
    
    const prompt = `A modern, abstract, digital icon-style logo for a GPT (AI assistant). GPT Name: "${name}". GPT Description: "${description}". Focus on a clean, visually appealing design suitable for a small icon.`;

    try {
      const result = await websim.imageGen({ prompt: prompt, aspect_ratio: "1:1", transparent: true });
      gptLogoPreview.src = result.url;
      gptLogoUrlInput.value = result.url;
      gptFormStatus.textContent = 'Logo generated!';
      gptFormStatus.className = 'form-status success';
    } catch (error) {
      console.error('Error generating logo:', error);
      gptFormStatus.textContent = `Error generating logo: ${error.message}`;
      gptFormStatus.className = 'form-status error';
      gptLogoPreview.src = 'ai-logo.png'; // Fallback to default
      gptLogoUrlInput.value = 'ai-logo.png';
    } finally {
      generateGptLogoButton.disabled = false;
      generateGptLogoButton.textContent = 'Generate Logo';
      setTimeout(() => { gptFormStatus.textContent = ''; gptFormStatus.className = 'form-status';}, 3000);
    }
  }

  async function handleSaveGpt() {
    const name = gptNameInput.value.trim();
    const description = gptDescriptionInput.value.trim();
    const systemPrompt = gptSystemPromptInput.value.trim();
    const modelId = gptModelSelector.value;
    const logoUrl = gptLogoUrlInput.value || 'ai-logo.png';

    if (!name || !description || !systemPrompt || !modelId) {
      gptFormStatus.textContent = 'All fields (Name, Description, System Prompt, Model) are required.';
      gptFormStatus.className = 'form-status error';
      return;
    }

    saveGptButton.disabled = true;
    saveGptButton.textContent = 'Saving...';
    gptFormStatus.textContent = 'Saving GPT...';
    gptFormStatus.className = 'form-status';

    try {
      const newGptData = { name, description, systemPrompt, modelId, logoUrl };
      await room.collection(CUSTOM_GPT_COLLECTION_NAME).create(newGptData);
      
      gptFormStatus.textContent = 'GPT saved successfully!';
      gptFormStatus.className = 'form-status success';
      setTimeout(() => {
        closeCreateGptModal();
        openGptStore(); // Re-open store to see the new GPT
      }, 1500);
    } catch (error) {
      console.error('Error saving GPT:', error);
      gptFormStatus.textContent = `Error saving GPT: ${error.message}`;
      gptFormStatus.className = 'form-status error';
      saveGptButton.disabled = false;
      saveGptButton.textContent = 'Save GPT';
    }
  }
  
  function populateGptModelSelector() {
    gptModelSelector.innerHTML = '';
    Array.from(modelSelector.options).forEach(option => {
        const newOption = document.createElement('option');
        newOption.value = option.value;
        newOption.textContent = option.textContent;
        gptModelSelector.appendChild(newOption);
    });
    if (gptModelSelector.options.length > 0) {
        gptModelSelector.value = selectedModel; // Default to current app selection or first
    }
  }

  // --- End GPT Store/Create Functions ---

  async function loadModels() {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models');
      const data = await response.json();
      
      if (data && data.data && Array.isArray(data.data)) {
        modelSelector.innerHTML = '';
        const processedModels = new Set();

        data.data.forEach(model => {
          let modelName = model.name;
          modelName = modelName.replace(/\(free\)/gi, '').trim();
          modelName = modelName.replace(/^[^:]+:\s*/, '').trim();

          if (!processedModels.has(modelName)) {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = modelName;
            modelSelector.appendChild(option);
            processedModels.add(modelName);
          }
        });
        
        const currentSelectedModelId = activeCustomGpt ? activeCustomGpt.modelId : selectedModel;
        const selectedOptionExists = Array.from(modelSelector.options).some(opt => opt.value === currentSelectedModelId);

        if (selectedOptionExists) {
            modelSelector.value = currentSelectedModelId;
        } else if (modelSelector.options.length > 0) {
            modelSelector.value = modelSelector.options[0].value;
            if (!activeCustomGpt) { // Only update selectedModel if not using custom GPT
                 selectedModel = modelSelector.options[0].value;
                 localStorage.setItem('selected_model', selectedModel);
            }
        }
        // After loading main models, populate the GPT creation form's model selector
        populateGptModelSelector();

      } else {
        console.error('No model data found or data is not an array.');
        modelSelector.innerHTML = '<option value="claude-3-5-sonnet-latest">Error: No models loaded</option>';
      }
    } catch (error) {
      console.error('Error loading models:', error);
      modelSelector.innerHTML = '<option value="claude-3-5-sonnet-latest">Error loading models</option>';
    }
  }

  function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    imageFile = file;
    const reader = new FileReader();
    reader.onload = function(event) {
      imagePreviewContainer.innerHTML = `
        <img src="${event.target.result}" class="image-preview" onclick="this.parentNode.innerHTML=''">
        <p class="image-caption">Click image to remove</p>
      `;
    };
    reader.readAsDataURL(file);
  }
  
  function initializeChat() {
    updateChatHistoryList();
    const chatIds = Object.keys(chatHistory);
    if (chatIds.length > 0) {
      if (currentChatId && chatHistory[currentChatId]) {
        loadChat(currentChatId);
      } else {
        loadChat(chatIds[0]);
      }
    } else {
      createNewChat();
    }
    updateChatUIForCustomGpt(); // Ensure UI reflects active custom GPT if any
  }
  
  function createNewChat() {
    const chatId = 'chat_' + Date.now();
    currentChatId = chatId;
    
    let initialTitle = 'New Chat';
    let initialWelcomeMessage = `Hello! I'm AllGPT 4. How can I help you today?`;
    
    if (activeCustomGpt) {
        initialTitle = `Chat with ${activeCustomGpt.name}`;
        initialWelcomeMessage = `Hello! I'm ${activeCustomGpt.name}. ${activeCustomGpt.description}. How can I help you?`;
        selectedModel = activeCustomGpt.modelId; // Set model for this chat
        modelSelector.value = activeCustomGpt.modelId;
    } else {
        // Reset to default model if no custom GPT is active, or ensure it matches main selector
        selectedModel = modelSelector.value || 'claude-3-5-sonnet-latest';
    }
    
    chatTitle.textContent = activeCustomGpt ? activeCustomGpt.name : 'AllGPT 4';
    updateChatUIForCustomGpt();


    const newChat = {
      id: chatId,
      title: initialTitle,
      createdAt: new Date().toISOString(),
      messages: [],
      activeCustomGptId: activeCustomGpt ? activeCustomGpt.id : null // Store active GPT with chat
    };
    
    chats[chatId] = newChat;
    chatHistory[chatId] = {
      id: chatId,
      title: initialTitle,
      createdAt: new Date().toISOString()
    };
    
    saveToLocalStorage();
    
    chatContainer.innerHTML = `<div class="chat-message assistant"><div class="message-content">${initialWelcomeMessage}</div></div>`;
    
    updateSidebarActiveState(chatId);
    updateChatHistoryList();
  }
  
  function loadChat(chatId) {
    currentChatId = chatId;
    
    if (chats[chatId]) {
      const loadedChatData = chats[chatId];
      // Restore activeCustomGpt if this chat was started with one
      if (loadedChatData.activeCustomGptId && communityGpts.length > 0) {
          activeCustomGpt = communityGpts.find(g => g.id === loadedChatData.activeCustomGptId) || null;
      } else if (loadedChatData.activeCustomGptId) {
          // If communityGpts not loaded yet, try to find it later or mark as potentially missing
          // For now, we assume communityGpts will be populated before this becomes an issue.
          console.warn("Trying to load chat with custom GPT, but community GPTs list is empty.");
          activeCustomGpt = null; // Fallback
      } else {
          activeCustomGpt = null;
      }
      
      updateChatUIForCustomGpt();
      loadChatFromState(loadedChatData);
      chatTitle.textContent = activeCustomGpt ? activeCustomGpt.name : (loadedChatData.title || 'AllGPT 4');

    } else {
      console.warn(`Chat with ID ${chatId} not found. Creating a new chat.`);
      activeCustomGpt = null; // Reset custom GPT context
      updateChatUIForCustomGpt();
      initializeChat();
      return;
    }
    updateSidebarActiveState(chatId);
  }
  
  function updateChatUIForCustomGpt() {
    if (activeCustomGpt) {
        headerAiAvatar.src = activeCustomGpt.logoUrl || 'ai-logo.png';
        customGptIndicator.textContent = `Using: ${activeCustomGpt.name}`;
        modelSelector.value = activeCustomGpt.modelId;
        modelSelector.disabled = true; // Disable model selector when custom GPT active
        userInput.placeholder = `Message ${activeCustomGpt.name}...`;
    } else {
        headerAiAvatar.src = 'ai-logo.png';
        customGptIndicator.textContent = '';
        modelSelector.disabled = false;
        modelSelector.value = selectedModel; // Reset to global selectedModel
        userInput.placeholder = `Message AllGPT 4...`;
    }
  }
  
  function loadChatFromState(chat) {
    chatContainer.innerHTML = '';
    
    let initialWelcomeMessage = `Hello! I'm AllGPT 4. How can I help you today?`;
    if (activeCustomGpt) { // Check if a custom GPT was active for this chat when it was created/loaded
        initialWelcomeMessage = `Hello! I'm ${activeCustomGpt.name}. ${activeCustomGpt.description}. How can I help you?`;
    } else if (chat.messages && chat.messages.length > 0) {
        // Do nothing, messages exist
    } else { // No messages, use default or custom welcome
         chatContainer.innerHTML = `<div class="chat-message assistant"><div class="message-content">${initialWelcomeMessage}</div></div>`;
         return;
    }
        
    if (!chat.messages || chat.messages.length === 0) {
         chatContainer.innerHTML = `<div class="chat-message assistant"><div class="message-content">${initialWelcomeMessage}</div></div>`;
        return;
    }
    
    chat.messages.forEach(msg => {
      const messageDiv = document.createElement('div');
      messageDiv.className = `chat-message ${msg.role}`;
      const messageContentDiv = document.createElement('div');
      messageContentDiv.className = 'message-content';
      const rawContent = msg.content || '';

      if (msg.type === 'image' && msg.imageUrl) {
        let htmlTextContent = '';
        if (rawContent) {
            if (msg.role === 'assistant') htmlTextContent = marked.parse(rawContent);
            else htmlTextContent = `<p>${escapeHtml(rawContent)}</p>`;
        }
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlTextContent;
        if (msg.role === 'assistant' && rawContent && window.renderMathInElement) renderMathInElement(tempDiv, katexOptions);
        messageContentDiv.innerHTML = tempDiv.innerHTML + `<img src="${msg.imageUrl}" class="message-image">`;
      } else if (msg.role === 'assistant') {
        if (msg.type === 'reasoning_session') {
            messageContentDiv.innerHTML = '';
            if (msg.reasoningSteps && Array.isArray(msg.reasoningSteps)) {
                msg.reasoningSteps.forEach(step => {
                    if (step.isFinalAnswer) messageContentDiv.innerHTML += formatFinalAnswerForDisplay(step.content);
                    else messageContentDiv.innerHTML += formatReasoningStepForDisplay(step.stepNumber, step.content);
                });
            }
            finalizeAssistantMessageDOM(messageContentDiv);
        } else {
            const markdownHtml = marked.parse(rawContent);
            messageContentDiv.innerHTML = markdownHtml;
            finalizeAssistantMessageDOM(messageContentDiv);
        }
      } else { messageContentDiv.innerHTML = escapeHtml(rawContent); }
      
      messageDiv.appendChild(messageContentDiv);
      chatContainer.appendChild(messageDiv);
      chatContainer.scrollTop = chatContainer.scrollHeight;
    });
  }
  
  function updateChatHistoryList() {
    if (!chatHistoryList) return;
    chatHistoryList.innerHTML = '';
    Object.values(chatHistory)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .forEach(chat => {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-history-item';
        chatItem.dataset.id = chat.id;
        if (chat.id === currentChatId) chatItem.classList.add('active');

        const titleSpan = document.createElement('span');
        titleSpan.className = 'chat-history-item-title';
        titleSpan.textContent = chat.title;
        titleSpan.addEventListener('click', () => loadChat(chat.id));

        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-chat-button';
        deleteButton.innerHTML = '&times;';
        deleteButton.dataset.id = chat.id;
        deleteButton.setAttribute('title', 'Delete chat');
        deleteButton.addEventListener('click', (event) => {
          event.stopPropagation();
          handleDeleteChat(chat.id);
        });

        chatItem.appendChild(titleSpan);
        chatItem.appendChild(deleteButton);
        chatHistoryList.appendChild(chatItem);
      });
  }

  function saveToLocalStorage() {
    localStorage.setItem('chat_history', JSON.stringify(chatHistory));
    localStorage.setItem('chats', JSON.stringify(chats));
  }

  async function makeRequest() {
    // Reset status and hide "Create New Account" button while we try
    statusInfo.innerHTML = '<p>Creating temporary account...</p>';
    newAccountButton.style.display = 'none';

    const payload = {
      referrer: "/",
      is_temp: true
    };

    try {
      const response = await fetch('https://puter.com/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': '*/*',
          'Origin': 'https://puter.com',
          'Referer': 'https://puter.com/'
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (data && data.token) {
        bearerToken = data.token;
        localStorage.setItem('claude_bearer_token', bearerToken);
        statusInfo.innerHTML = '<p>Account created successfully! Chat is ready.</p>';
        newAccountButton.style.display = 'none';
        await checkUsage(); // Check usage and update UI
      } else {
        statusInfo.innerHTML = '<p>Error creating account. Please try again.</p>';
        newAccountButton.style.display = 'block';
        throw new Error('Error creating account: No token received');
      }
    } catch (error) {
      console.error('Request error:', error);
      statusInfo.innerHTML = `<p>Error creating account. Please try again or reload the page.</p>`;
      newAccountButton.style.display = 'block';
      throw error;
    }
  }

  async function checkUsage() {
    if (!bearerToken) {
        // No UI element to update for usage text, statusInfo can be used if needed.
        console.warn('No account available for usage check.');
        newAccountButton.style.display = 'none'; // Hide if no token
        return;
    }
    try {
      const response = await fetch('https://api.puter.com/drivers/usage', {
        method: 'GET',
        headers: {
          'Accept': '*/*',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0IjoicyIsInYiOiIwLjAuMCIsInUiOiJFVDgwN2tCeFRyT0FUWEZGQmlUVmp3PT0iLCJ1dSI6IkZMQlJKOER5U3JlOHJkRVBNM0FKYXc9PSIsImlhdCI6MTc0ODQ2Mjc5Nn0.tGPf1xJDJIr9rL4K_YG5bLu7613zLl2MJJ_Obqwif2k`,
          'Origin': 'https://puter.com',
          'Referer': 'https://puter.com/'
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Usage check HTTP error:', response.status, errorText);
        newAccountButton.style.display = 'none'; // Default to hidden on error
        // No UI element for usageText to update. statusInfo could be used for critical errors.
        if (response.status === 401 || response.status === 403) {
            statusInfo.innerHTML = '<p>Authentication error. Attempting to create new temporary account...</p>';
            newAccountButton.style.display = 'block'; // Show button if auth error, user might need to create new
            await makeRequest();
        } else {
            statusInfo.innerHTML = `<p>Error checking account status: ${response.status}.</p>`;
        }
        return;
      }
      
      const data = await response.json();
      if (data && data.usages && data.usages.length > 0) {
        const creditUsage = data.usages.find(usage => usage.id === 'prod-credit');
        if (creditUsage) {
          let usedPercentage;
          if (creditUsage.available > 0) {
              usedPercentage = (creditUsage.used / creditUsage.available) * 100;
          } else {
              usedPercentage = (creditUsage.used > 0) ? 100 : 0; // If available is 0, and used is >0, it's 100%
          }
          
          // Show/hide "Create New Account" button based on usage
          if (usedPercentage >= 95) {
            newAccountButton.style.display = 'block';
          } else {
            newAccountButton.style.display = 'none';
          }

          if (usedPercentage >= 100) {
            statusInfo.innerHTML = '<p>Quota usage exceeded. Creating a new temporary account...</p>';
            newAccountButton.style.display = 'block'; // Ensure it's visible if making new request
            await makeRequest(); 
          } else {
            // Optionally update statusInfo if quota is low, but not with a percentage bar.
            // For now, keeping statusInfo updates minimal to reflect the "hide usage panel" request.
            // statusInfo.innerHTML = `<p>Account status OK. Usage: ${usedPercentage.toFixed(1)}%</p>` // Example if some feedback is desired
          }
        } else {
            // No UI element for usageText to update.
            console.warn('Credit usage data not found in API response.');
            newAccountButton.style.display = 'none'; // Default to hidden
        }
      } else {
          // No UI element for usageText to update.
          console.warn('No usage data received from API.');
          newAccountButton.style.display = 'none'; // Default to hidden
      }
    } catch (error) {
      console.error('Usage check error:', error);
      statusInfo.innerHTML = '<p>Could not retrieve account status.</p>';
      newAccountButton.style.display = 'none'; // Default to hidden on error
    }
  }
  
  async function sendMessage() {
    const message = userInput.value.trim();
    if ((!message && !imageFile) || !currentChatId) return;

    userInput.disabled = true;
    sendButton.disabled = true;
    let typingIndicator; // Declare here to be accessible in catch/finally
    
    try {
      await checkUsage(); // Check usage and renew token if necessary. bearerToken might change.

      if (!bearerToken) { // If token is still missing after checkUsage (e.g., makeRequest failed)
          statusInfo.innerHTML = '<p>Account not available. Please try creating one manually or reload.</p>';
          userInput.disabled = false;
          sendButton.disabled = false;
          userInput.focus();
          return;
      }
      
      let imageUrl = null;
      let localImagePreviewUrl = null; // For displaying image before upload for user message
      
      if (imageFile) {
        // Display local preview immediately for user message
        localImagePreviewUrl = URL.createObjectURL(imageFile); 
        try {
          imageUrl = await websim.upload(imageFile);
        } catch (error) {
          console.error('Error uploading image:', error);
          appendMessage('assistant', "Error uploading image: " + error.message);
          // Clean up and re-enable inputs if image upload fails critically
          userInput.disabled = false;
          sendButton.disabled = false;
          userInput.focus();
          imagePreviewContainer.innerHTML = '';
          imageFile = null;
          if(localImagePreviewUrl) URL.revokeObjectURL(localImagePreviewUrl);
          return;
        }
      }
      
      const messageType = imageUrl ? 'image' : 'text';
      // Use localImagePreviewUrl for immediate display in user's message
      appendMessage('user', message, localImagePreviewUrl || imageUrl); 
      
      saveMessageToState({
        role: 'user',
        type: messageType,
        content: message,
        imageUrl, // Save the actual uploaded URL to state
        timestamp: new Date().toISOString()
      });
      
      const originalUserQuery = message; // Keep original for reasoning session title
      userInput.value = '';
      userInput.style.height = 'auto'; // Reset height
      imagePreviewContainer.innerHTML = '';
      if(localImagePreviewUrl && localImagePreviewUrl !== imageUrl) URL.revokeObjectURL(localImagePreviewUrl); // Clean up blob URL
      imageFile = null;
      
      if (reasoningModeActive) {
        await runReasoningSession(originalUserQuery, imageUrl);
      } else {
        typingIndicator = document.createElement('div');
        typingIndicator.className = 'chat-message assistant';
        typingIndicator.innerHTML = '<div class="message-content">Thinking...</div>';
        chatContainer.appendChild(typingIndicator);
        chatContainer.scrollTop = chatContainer.scrollHeight;
        
        const conversationHistory = getConversationHistory(); // Gets all *previous* messages
        
        let userApiMessageContent;
        if (imageUrl) {
            userApiMessageContent = [];
            if (message) userApiMessageContent.push({ type: 'text', text: message });
            userApiMessageContent.push({ type: 'image_url', image_url: { url: imageUrl } });
        } else { 
            userApiMessageContent = message;
        }
        // Add current user message to history for API call
        const messagesForApi = [...conversationHistory, { role: 'user', content: userApiMessageContent }];
        
        const responseText = await callClaudeAPI(messagesForApi);
        
        if (typingIndicator && chatContainer.contains(typingIndicator)) {
          chatContainer.removeChild(typingIndicator);
        }
        
        if (responseText) {
          appendMessage('assistant', responseText);
          
          saveMessageToState({
            role: 'assistant',
            type: 'text', 
            content: responseText,
            timestamp: new Date().toISOString()
          });
          
          if (chats[currentChatId] && chats[currentChatId].messages.length <= 2 ) { 
              if (originalUserQuery) updateChatTitle(originalUserQuery); 
              else if (imageUrl && chats[currentChatId].title === 'New Chat') updateChatTitle("Image Chat");
          }
        } else {
          appendMessage('assistant', "I'm sorry, I couldn't process your request. Please try again.");
        }
      }
    } catch (error) {
      console.error('API error or send message error:', error);
      if (typingIndicator && chatContainer.contains(typingIndicator)) {
        chatContainer.removeChild(typingIndicator);
      }
      appendMessage('assistant', `Error: ${error.message || 'An unexpected error occurred.'}`);
      statusInfo.innerHTML = `<p>Error: ${error.message || 'An unexpected error occurred.'}</p><p>You might need to create a new account or reload.</p>`;
    } finally {
      userInput.disabled = false;
      sendButton.disabled = false;
      userInput.focus();
    }
  }
  
  function saveMessageToState(message) {
    if (!currentChatId || !chats[currentChatId]) {
        console.error("Cannot save message, current chat not found:", currentChatId);
        return;
    }
    const currentChat = chats[currentChatId];
    
    currentChat.messages = [...(currentChat.messages || []), message];
    
    // Update local storage
    chats[currentChatId] = currentChat; // currentChat is already a reference from chats[currentChatId]
    saveToLocalStorage();
  }
  
  function updateChatTitle(userMessage) {
    if (!currentChatId || !chatHistory[currentChatId] || !chats[currentChatId]) return;

    // Ensure userMessage is a string, provide fallback if not (e.g. image-only message)
    const titleText = (typeof userMessage === 'string' && userMessage.trim() !== '') 
                      ? userMessage 
                      : (chats[currentChatId].title !== 'New Chat' ? chats[currentChatId].title : "Chat");

    const title = titleText.length > 30 
      ? titleText.substring(0, 30) + '...' 
      : titleText;
      
    chatHistory[currentChatId].title = title;
    chats[currentChatId].title = title;
    
    const historyItemTitleElement = document.querySelector(`.chat-history-item[data-id="${currentChatId}"] .chat-history-item-title`);
    if (historyItemTitleElement) {
        historyItemTitleElement.textContent = title;
    }

    if(currentChatId === chatHistory[currentChatId].id){ // Check if currentChatId matches before updating main title
        chatTitle.textContent = title;
    }
    
    saveToLocalStorage();
  }
  
  function appendMessage(sender, content, imageUrl = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${sender}`;
    
    const messageContentDiv = document.createElement('div');
    messageContentDiv.className = 'message-content';
    messageDiv.appendChild(messageContentDiv);
    
    const rawContent = content || ''; // Ensure content is at least an empty string

    if (imageUrl) {
      let htmlTextContent = '';
      if (rawContent) {
        if (sender === 'assistant') {
          htmlTextContent = marked.parse(rawContent);
        } else { 
          htmlTextContent = `<p>${escapeHtml(rawContent)}</p>`;
        }
      }
      
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = htmlTextContent;

      if (sender === 'assistant' && rawContent && window.renderMathInElement) {
          renderMathInElement(tempDiv, katexOptions);
      }
      messageContentDiv.innerHTML = tempDiv.innerHTML + `<img src="${imageUrl}" class="message-image">`;

    } else if (sender === 'assistant') {
      // Reasoning sessions are handled by runReasoningSession directly for progressive display.
      // This path is for simple, non-reasoning assistant messages.
      const markdownHtml = marked.parse(rawContent);
      messageContentDiv.innerHTML = markdownHtml;
      finalizeAssistantMessageDOM(messageContentDiv);
    } else { // User message
      messageContentDiv.innerHTML = escapeHtml(rawContent);
    }
    
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }
  
  function escapeHtml(text) {
    if (typeof text !== 'string') return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  
  window.copyToClipboard = function(button) {
    const codeElement = button.parentElement.querySelector('code');
    const textToCopy = codeElement.textContent;
    
    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        setTimeout(() => {
          button.textContent = originalText;
        }, 1500);
      })
      .catch(err => {
        console.error('Error copying text:', err);
      });
  };
  
  function callClaudeAPI(messages) {
    // Ensure messages conform to the expected API structure (user/assistant roles)
    const formattedMessages = messages.map(msg => {
        // If msg.content is already an array (for multimodal), use as is.
        // Otherwise, ensure it's a string for simple text messages.
        let apiContent;
        if (Array.isArray(msg.content)) {
            apiContent = msg.content;
        } else if (typeof msg.content === 'string') {
            apiContent = msg.content;
        } else {
            // Fallback for unexpected content types
            apiContent = JSON.stringify(msg.content); 
        }

        return {
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: apiContent
        };
    }).filter(msg => msg.content); // Filter out messages with no content, if any

    return fetch('https://api.puter.com/drivers/call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0IjoicyIsInYiOiIwLjAuMCIsInUiOiJFVDgwN2tCeFRyT0FUWEZGQmlUVmp3PT0iLCJ1dSI6IkZMQlJKOER5U3JlOHJkRVBNM0FKYXc9PSIsImlhdCI6MTc0ODQ2Mjc5Nn0.tGPf1xJDJIr9rL4K_YG5bLu7613zLl2MJJ_Obqwif2k`,
        'Accept': '*/*',
        'Origin': 'https://docs.puter.com', // Or a more generic origin like the app's own
        'Referer': 'https://docs.puter.com/' // Same as above
      },
      body: JSON.stringify({
        "interface": "puter-chat-completion",
        "driver": "openrouter",
        "test_mode": false,
        "method": "complete",
        "args": {
          "messages": formattedMessages,
          "model": selectedModel,
          "stream": false // Change to true for streaming if supported and implemented
        }
      })
    })
    .then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          throw new Error(`API Network error (${response.status}): ${text}`);
        });
      }
      return response.json();
    })
    .then(data => {
      if (data && data.result && data.result.message && typeof data.result.message.content === 'string') {
        return data.result.message.content;
      } else if (data && data.result && data.result.message && Array.isArray(data.result.message.content)) {
          // Handle multimodal response if API returns content array
          const textPart = data.result.message.content.find(part => part.type === 'text');
          return textPart ? textPart.text : JSON.stringify(data.result.message.content); // Fallback if no text part
      }
       else {
        console.error('Invalid API response format. Full response:', data);
        throw new Error('Invalid API response format: ' + JSON.stringify(data).substring(0, 200) + "...");
      }
    });
  }
  
  function getConversationHistory() {
    if (chats && chats[currentChatId] && chats[currentChatId].messages) {
      return chats[currentChatId].messages.map(msg => {
        // Exclude reasoning session details from standard history for next normal call prompt
        // Only include user messages and simple assistant responses
        if (msg.type === 'reasoning_session') {
          return { // Represent the reasoning session as a single assistant turn with its final answer
            role: 'assistant',
            content: msg.finalAnswer || "Completed reasoning session." 
          };
        }
        
        let apiContent;
        if (msg.type === 'image' && msg.imageUrl) {
            apiContent = [];
            if (msg.content) apiContent.push({ type: 'text', text: msg.content });
            apiContent.push({ type: 'image_url', image_url: { url: msg.imageUrl } });
        } else {
            apiContent = msg.content; // Assumes text content
        }
        return {
          role: msg.role,
          content: apiContent
        };
      }); // No slice(-1) here, as the current user message is added by the caller if needed
    }
    return [];
  }
  
  function updateSidebarActiveState(activeId) {
    const chatItems = document.querySelectorAll('.chat-history-item');
    chatItems.forEach(item => item.classList.remove('active'));
    
    const activeItem = document.querySelector(`.chat-history-item[data-id="${activeId}"]`);
    if (activeItem) {
      activeItem.classList.add('active');
    }
  }

  function handleDeleteChat(chatIdToDelete) {
    if (!confirm(`Are you sure you want to delete "${chatHistory[chatIdToDelete]?.title || 'this chat'}"? This action cannot be undone.`)) {
        return;
    }

    delete chats[chatIdToDelete];
    delete chatHistory[chatIdToDelete];
    
    saveToLocalStorage();
    
    if (currentChatId === chatIdToDelete) {
      currentChatId = null; // Clear current chat ID
      // chatContainer.innerHTML = ''; // Clear main chat view immediately
      // chatTitle.textContent = 'AllGPT 4'; // Reset title
      
      const remainingChatIds = Object.keys(chatHistory);
      if (remainingChatIds.length > 0) {
        // Sort by creation date descending to get the most recent as the "first"
        const sortedRemainingChatIds = remainingChatIds.sort((a,b) => 
            new Date(chatHistory[b].createdAt) - new Date(chatHistory[a].createdAt)
        );
        loadChat(sortedRemainingChatIds[0]);
      } else {
        createNewChat(); // If no chats left, create a fresh one
      }
    }
    
    updateChatHistoryList(); // Refresh the sidebar
  }

  // --- Reasoning Mode Functions ---

  async function runReasoningSession(userQuery, userImageUrl) {
    let accumulatedStepsContent = []; // Store only content of steps for prompt
    let currentStepNumber = 1;
    let reasoningSessionData = {
        role: 'assistant',
        type: 'reasoning_session',
        userQuery: userQuery,
        userImageUrl: userImageUrl,
        reasoningSteps: [],
        finalAnswer: null,
        timestamp: new Date().toISOString()
    };

    const assistantMessageDiv = createMessageDivForParent('assistant');
    const assistantContentDiv = assistantMessageDiv.querySelector('.message-content');
    assistantContentDiv.innerHTML = '<p><em>Assistant is reasoning...</em></p>';
    chatContainer.appendChild(assistantMessageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    let continueReasoning = true;

    while (continueReasoning && currentStepNumber <= MAX_REASONING_STEPS) {
        const promptTextForThisStep = constructReasoningPromptText(userQuery, userImageUrl, accumulatedStepsContent, currentStepNumber === 1);
        
        let currentStepApiMessages = [];
        let currentStepUserContent;

        if (userImageUrl && currentStepNumber === 1) { // Send image only with the first reasoning prompt text
            currentStepUserContent = [];
            currentStepUserContent.push({ type: 'text', text: promptTextForThisStep });
            currentStepUserContent.push({ type: 'image_url', image_url: { url: userImageUrl } });
        } else {
            currentStepUserContent = promptTextForThisStep;
        }
        currentStepApiMessages.push({ role: 'user', content: currentStepUserContent });

        try {
            const rawResponse = await callClaudeAPI(currentStepApiMessages);
            
            let responseContent = rawResponse;
            let isFinalStepInSession = false; 

            if (rawResponse.includes(CONTINUE_REASONING_TOKEN)) {
                responseContent = rawResponse.replace(CONTINUE_REASONING_TOKEN, '').trim();
                // isFinalStepInSession remains false
            } else { // This includes END_REASONING_TOKEN or no token
                if (rawResponse.includes(END_REASONING_TOKEN)) {
                    responseContent = rawResponse.replace(END_REASONING_TOKEN, '').trim();
                }
                // If neither token, responseContent is rawResponse. It will be trimmed next.
                isFinalStepInSession = true;
            }
            responseContent = responseContent.trim();

            if (currentStepNumber === 1 && assistantContentDiv.innerHTML.includes('<em>Assistant is reasoning...</em>')) {
                 assistantContentDiv.innerHTML = ''; // Clear "Assistant is reasoning..."
            }
            
            const stepUIData = { 
                stepNumber: currentStepNumber, 
                content: responseContent, 
                isFinalAnswer: isFinalStepInSession // Mark if this is the final answer step
            };
            reasoningSessionData.reasoningSteps.push(stepUIData);
            
            if (isFinalStepInSession) {
                assistantContentDiv.innerHTML += formatFinalAnswerForDisplay(responseContent);
                reasoningSessionData.finalAnswer = responseContent;
                continueReasoning = false; // End the loop
            } else {
                assistantContentDiv.innerHTML += formatReasoningStepForDisplay(stepUIData.stepNumber, stepUIData.content);
                accumulatedStepsContent.push(responseContent); // Only add to history for next prompt if not final
                currentStepNumber++;
            }

        } catch (error) {
            console.error("Error during reasoning step:", error);
            if (currentStepNumber === 1 && assistantContentDiv.innerHTML.includes('<em>Assistant is reasoning...</em>')) {
                assistantContentDiv.innerHTML = ''; // Clear "Assistant is reasoning..."
            }
            assistantContentDiv.innerHTML += `<p class="error">Error during reasoning: ${error.message}</p>`;
            continueReasoning = false; // Stop reasoning on error
            // Ensure finalAnswer reflects the error state if nothing else was set
            reasoningSessionData.finalAnswer = (reasoningSessionData.reasoningSteps.length > 0 
                ? reasoningSessionData.reasoningSteps[reasoningSessionData.reasoningSteps.length-1].content 
                : "") + ` An error occurred: ${error.message}`;
        }
        chatContainer.scrollTop = chatContainer.scrollHeight;
         finalizeAssistantMessageDOM(assistantContentDiv); // Apply highlighting after each step/final answer
    }

    if (currentStepNumber > MAX_REASONING_STEPS && continueReasoning) { // Check continueReasoning to ensure loop wasn't broken by error/final
        assistantContentDiv.innerHTML += `<p class="error">Max reasoning steps (${MAX_REASONING_STEPS}) reached.</p>`;
        // If final answer not set, set it to the last step's content + warning
        if (!reasoningSessionData.finalAnswer && reasoningSessionData.reasoningSteps.length > 0) {
             reasoningSessionData.finalAnswer = reasoningSessionData.reasoningSteps[reasoningSessionData.reasoningSteps.length -1].content + " (Max reasoning steps reached)";
        } else if (!reasoningSessionData.finalAnswer) {
            reasoningSessionData.finalAnswer = "Max reasoning steps reached.";
        }
    }
    
    finalizeAssistantMessageDOM(assistantContentDiv); // Final pass for highlighting

    saveMessageToState(reasoningSessionData);
    if (chats[currentChatId] && chats[currentChatId].messages.length <= 2 ) { 
        if (userQuery) updateChatTitle(userQuery); 
        else if (userImageUrl && chats[currentChatId].title === 'New Chat') updateChatTitle("Image Reasoning Chat");
    }
  }

  function constructReasoningPromptText(originalUserQuery, originalUserImageUrl, previousStepsContent, isFirstStep) {
    const imageUrlNotice = originalUserImageUrl ? ` The user has also provided an image.` : "";
    let promptParts = [];
    
    if (isFirstStep) {
        promptParts.push(`You are in reasoning mode. Your goal is to answer the user's query: "${originalUserQuery}".${imageUrlNotice}`);
        promptParts.push("Think step-by-step. Each step should be concise (max 100 words).");
        promptParts.push(`If you need to continue, end your response with ${CONTINUE_REASONING_TOKEN}.`);
        promptParts.push(`If you have the final answer, provide it and end with ${END_REASONING_TOKEN}.`);
        promptParts.push(`\nNow, provide your first reasoning step for the query: "${originalUserQuery}"`);
    } else {
        promptParts.push(`Continuing reasoning for query: "${originalUserQuery}".${imageUrlNotice}`);
        promptParts.push("Previous steps:");
        previousStepsContent.forEach((step, index) => {
            promptParts.push(`Step ${index + 1}: ${step}`);
        });
        promptParts.push("\nProvide the next reasoning step or the final answer.");
        promptParts.push(`End with ${CONTINUE_REASONING_TOKEN} to continue, or ${END_REASONING_TOKEN} for the final answer.`);
    }
    return promptParts.join('\n');
  }

  function formatReasoningStepForDisplay(stepNumber, content) {
      const markdownHtml = marked.parse(content);
      return `<div class="reasoning-step"><strong>Step ${stepNumber}:</strong>${markdownHtml}</div>`;
  }

  function formatFinalAnswerForDisplay(content) {
    return marked.parse(content);
  }
  
  function finalizeAssistantMessageDOM(assistantContentDiv) {
      if (window.renderMathInElement) {
          renderMathInElement(assistantContentDiv, katexOptions);
      }
  }

  function createMessageDivForParent(sender) {
      const messageDiv = document.createElement('div');
      messageDiv.className = `chat-message ${sender}`;
      
      const messageContentDiv = document.createElement('div');
      messageContentDiv.className = 'message-content';
      messageDiv.appendChild(messageContentDiv);
      
      return messageDiv;
  }
});