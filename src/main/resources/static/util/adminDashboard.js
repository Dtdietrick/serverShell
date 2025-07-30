//File:adminDashboard.js

//admin only utils
document.addEventListener("DOMContentLoaded", () => {
  fetch("/user/role")
    .then(res => res.json())
    .then(user => {
        console.log("User role:", user.role);
      if (user.role === "ROLE_ADMIN") {
        renderAdminControls();
      }
    });
});

function renderAdminControls() {
  const adminDiv = document.getElementById("admin-panel");

  adminDiv.style.display = "block";
  
  adminDiv.innerHTML = `
    <h2>Admin Controls</h2>
    
    <h3>Add User</h3>
    <input type="text" id="new-username" placeholder="Username" />
    <input type="password" id="new-password" placeholder="Password" />
    <input type="text" id="new-role" placeholder="Role (e.g. ROLE_USER)" />
    <button onclick="addUser()">➕ Add</button>

    <h3>Remove User</h3>
    <input type="text" id="remove-username" placeholder="Username to remove" />
    <button onclick="removeUser()">🗑 Remove</button>
  `;
}

function addUser() {
  const user = {
    username: document.getElementById("new-username").value,
    password: document.getElementById("new-password").value,
    role: document.getElementById("new-role").value
  };

  fetch("/admin/add", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(user)
  })
    .then(res => {
      if (!res.ok) throw new Error("Failed to add user");
      return res.json();
    })
    .then(data => alert(`User ${data.username} added.`))
    .catch(err => alert(err));
}

function removeUser() {
  const username = document.getElementById("remove-username").value;

  fetch(`/admin/remove/${encodeURIComponent(username)}`, {
    method: "DELETE"
  })
    .then(res => {
      if (!res.ok) throw new Error("Failed to remove user");
      return res.text();
    })
    .then(msg => alert(msg))
    .catch(err => alert(err));
}