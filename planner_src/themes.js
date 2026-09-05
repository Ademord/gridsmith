  // Theme preference is independent of layout backups, drafts, and image storage.
  (function () {
    var key = 'gridsmith.theme';
    var themes = [
      { id: 'charcoal', name: 'Charcoal' },
      { id: 'violet', name: 'Violet' },
      { id: 'amber', name: 'Amber' },
      { id: 'light', name: 'Light' }
    ];
    function valid(value) { return themes.some(function (theme) { return theme.id === value; }); }
    var current = 'charcoal';
    try { var saved = localStorage.getItem(key); if (valid(saved)) current = saved; } catch (error) {}
    document.documentElement.dataset.theme = current;

    var menu = document.querySelector('.more-menu > div');
    if (!menu || document.getElementById('planner-theme')) return;
    var label = document.createElement('label');
    label.className = 'theme-field';
    label.htmlFor = 'planner-theme';
    var title = document.createElement('span'); title.id = 'planner-theme-label'; title.textContent = 'Theme';
    var select = document.createElement('select'); select.id = 'planner-theme';
    select.setAttribute('aria-labelledby', title.id);
    themes.forEach(function (theme) {
      var option = document.createElement('option');
      option.value = theme.id; option.textContent = theme.name;
      select.appendChild(option);
    });
    select.value = current;
    var status = document.createElement('span');
    status.className = 'theme-status'; status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    label.append(title, select); menu.append(label, status);

    select.addEventListener('change', function () {
      if (!valid(select.value)) return;
      current = select.value;
      document.documentElement.dataset.theme = current;
      var saved = true;
      try { localStorage.setItem(key, current); } catch (error) { saved = false; }
      status.textContent = select.options[select.selectedIndex].textContent + ' theme.' +
        (saved ? '' : ' This choice could not be saved for your next visit.');
    });
    // Let the native select handle its keys without triggering planner shortcuts.
    select.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        document.querySelector('.more-menu').open = false;
        document.querySelector('.more-menu summary').focus();
      }
      event.stopPropagation();
    });
    window.addEventListener('storage', function (event) {
      if (event.key !== key) return;
      current = valid(event.newValue) ? event.newValue : 'charcoal';
      document.documentElement.dataset.theme = current;
      select.value = current;
    });
  }());
