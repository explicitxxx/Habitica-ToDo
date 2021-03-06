$(function() {
  chrome.storage.sync.get([
    "habitica_todo_user_id",            // User ID for authentication
    "habitica_todo_api_token",          // API token as password for User ID
    "habitica_todo_difficulty",         // String of difficulty, eg 'medium'
    "habitica_todo_show_options",       // Show options on icon click? eg 'yes'
    "habitica_todo_autoclose_tab",      // Close tab after success? eg 'no'
    "habitica_todo_prefix",
    "habitica_todo_suffix",
    "habitica_todo_add_days",
    "habitica_todo_success_sound"
  ], function(items) {
    if (!chrome.runtime.error) {
      // If you are missing your user id or api token, then open newtab to options.
      if (!items.habitica_todo_user_id || !items.habitica_todo_api_token) {
        chrome.tabs.create({'url': '/options_page.html'});
      } else {

        // Defaults. We could just redirect to options page but this way I don't
        // bug users constantly while I am developing.
        if (!items.habitica_todo_difficulty)    { items.habitica_todo_difficulty    = 'easy'      }
        if (!items.habitica_todo_show_options)  { items.habitica_todo_show_options  = 'yes'       }
        if (!items.habitica_todo_autoclose_tab) { items.habitica_todo_autoclose_tab = 'no'        }
        if (!items.habitica_todo_success_sound) { items.habitica_todo_success_sound = 'success_4' }
        if (!items.habitica_todo_prefix)        { items.habitica_todo_prefix        = ''          }
        if (!items.habitica_todo_suffix)        { items.habitica_todo_suffix        = ''          }
        if (!items.habitica_todo_add_days)      { items.habitica_todo_add_days      = ''          }

        // Get the current window behind the popup
        // We need this for the url, the title, and the id (to autoclose it)
        chrome.tabs.query({
          active: true,
          currentWindow: true
        }, function(tab) {
          items.tab_title = tab[0].title;       // eg 'Facebook'
          items.tab_url   = tab[0].url;         // eg 'http://www.facebook.com'
          items.tab_id    = tab[0].id;          // eg '123'
          items.due_date  = '';

          // If 'Don't show' setting, then just show the loader and post
          if (items.habitica_todo_show_options == 'no') {
            $("body").load("loader.html", function() {
              post_data(items);
            });
          } else {
            prepare_form(items);
          }
        });
      }
    }
  });
});

function prepare_form(items) {
  $("body").load("popup_form.html", function() {

    // Populate the form with some defaults.
    // Jquery lets us trigger 'clicks' on radios so the right default is selected
    $("#title").val(items.tab_title);
    $("#url").val(items.tab_url);
    $('#prefix').val(items.habitica_todo_prefix);
    $('#suffix').val(items.habitica_todo_suffix);
    $("input:radio[name=difficulty]")
      .filter("[value="+items.habitica_todo_difficulty+"]")
      .trigger("click");


    //
    if (items.habitica_todo_add_days != '') {
      $("#date").val(moment().add(items.habitica_todo_add_days, 'days').format('YYYY/MM/DD'));
    }
    console.log(moment($("#date").val()));
    console.log(moment($("#date").val()).utc());
    console.log(moment($("#date").val()).utc().toISOString());

    $("#date").datepicker({
      format: "yyyy/mm/dd",
      todayBtn: "linked",
      autoclose: true,
      todayHighlight: true
    });


    $("#send_button").on("click", function() {
      // Wrapper covers the entire area, inner only covers a strip.
      // This is so we can have only 1 loader, but different heights
      $('#loading_wrapper').show();
      $('#loading_inner').load('loader.html');

      // Update the array values to match the values in the input fields
      items.habitica_todo_prefix     = $('#prefix').val();
      items.habitica_todo_suffix     = $('#suffix').val();
      items.tab_title                = $('#title').val();
      items.tab_url                  = $('#url').val();
      items.due_date                 = $('#date').val(); // + 'T14:00:00.000Z'
      items.habitica_todo_difficulty = $('input:radio[name=difficulty]:checked').val();
      post_data(items);
    })
  });
}

function post_data(items){

  xhr = new XMLHttpRequest();
  xhr.open("POST", "https://habitica.com/api/v3/tasks/user", true);
  xhr.setRequestHeader("Content-type", "application/json");
  xhr.setRequestHeader("x-api-user", items.habitica_todo_user_id);
  xhr.setRequestHeader("x-api-key", items.habitica_todo_api_token);
  xhr.onreadystatechange = function() {
    if (xhr.readyState == 4) {

      // Habitica uses 201, but v2 used 200, so this is mostly just incase
      // they change something in the future
      if (xhr.status == 201 || xhr.status == 200) {
        if (items.habitica_todo_success_sound != 'none') {
          var success_sound = new Audio('sounds/'+items.habitica_todo_success_sound+'.mp3');
          success_sound.addEventListener('ended', function() {
            if (items.habitica_todo_autoclose_tab == 'yes') {
              chrome.tabs.remove(items.tab_id);
            } else {
              window.close();
            }
          })
          success_sound.play();
        } else {
          if (items.habitica_todo_autoclose_tab == 'yes') {
            chrome.tabs.remove(items.tab_id);
          } else {
            window.close();
          }
        }
      } else {
        alert("Failed to send. Status code: "+xhr.status+". Status text: '"+xhr.statusText+"'");
        window.close();
      }
    }
  }

  // Remove ] and ) where it would break Habitica markdown
  var url   = items.tab_url.split(')').join('%29');
  var title = items.tab_title.split(']').join('\]')
                             .split('[').join('\[');

  // Change relative URLs to absolute.
  // If url doesn't begin with 'WORD://WHATEVER'
  if (!/^[a-zA-Z0-9_\-]+:\/\//.test(url)) {
    url = 'http://' + url;
  }

  // Difficulty is stored in Chrome Sync as string, so we adjust to number here
  var difficulty = 1;
  switch(items.habitica_todo_difficulty) {
    case 'trivial': difficulty = 0.1; break;
    case 'easy':    difficulty = 1;   break;
    case 'medium':  difficulty = 1.5; break;
    case 'hard':    difficulty = 2;   break;
    default:        difficulty = 1;   break;
  }

  // Adjust date from local timezone to UTC, then to an ISOString when posted
  if (items.due_date != '') {
    items.due_date = moment(
      $("#date").val()
    ).utc().toISOString();
  }

  // Build the string
  var string = "";
  if (items.habitica_todo_prefix != '') {
    string += items.habitica_todo_prefix;
  }
  string += "["+title+"]("+url+" )";
  if (items.habitica_todo_suffix != '') {
    string += items.habitica_todo_suffix;
  }

  // Finally post the formatted data.
  xhr.send(JSON.stringify({
    "text": string,
    "type": "todo",
    "value": "0",
    "priority": difficulty,
    "date": items.due_date
  }));
}
