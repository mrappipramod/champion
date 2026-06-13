// Existing tab switching – extend to hide/show forgot form
function switchAuthTab(tab) {
  document.getElementById('loginForm').style.display = (tab === 'login') ? '' : 'none';
  document.getElementById('signupForm').style.display = (tab === 'signup') ? '' : 'none';
  document.getElementById('forgotForm').style.display = 'none';  // always hide

  // update tab active states
  document.querySelectorAll('.auth-tab').forEach(btn => btn.classList.remove('active'));
  if (tab === 'login') document.querySelector('.auth-tab:nth-child(1)').classList.add('active');
  if (tab === 'signup') document.querySelector('.auth-tab:nth-child(2)').classList.add('active');
  clearAuthMsg();
}

// Show only the forgot password form
function showForgotForm() {
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('signupForm').style.display = 'none';
  document.getElementById('forgotForm').style.display = '';
  document.querySelectorAll('.auth-tab').forEach(btn => btn.classList.remove('active'));
  clearAuthMsg();
}

// Call our proxy to send recovery email
async function doForgotPassword() {
  const email = document.getElementById('forgotEmail').value.trim();
  const msgEl = document.getElementById('authMsg');
  if (!email) {
    msgEl.innerText = 'Please enter your email.';
    return;
  }

  const btn = document.querySelector('#forgotForm .btn');
  btn.disabled = true;
  btn.innerText = 'Sending...';
  msgEl.innerText = '';

  try {
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'forgot_password', email })
    });
    const data = await res.json();

    if (res.ok) {
      msgEl.innerText = 'If that email is registered, a recovery link has been sent.';
      // Optionally switch back to login after a delay
      setTimeout(() => switchAuthTab('login'), 3000);
    } else {
      msgEl.innerText = data.msg || data.error || 'Something went wrong.';
    }
  } catch (err) {
    msgEl.innerText = 'Network error. Please try again.';
  } finally {
    btn.disabled = false;
    btn.innerText = 'Send Reset Link';
  }
}

// Optional helper
function clearAuthMsg() {
  document.getElementById('authMsg').innerText = '';
}
