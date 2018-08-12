function get_random(length=2){
    const buf = new Uint32Array(length);
    window.crypto.getRandomValues(buf);
    return buf.join("");
}

function get_url_params(url){
    const paramterArray = [];
    const params = url.slice(url.indexOf('#') + 1).split('&');
    params.forEach(function(value){
        const param = value.split('=');
        paramterArray[param[0]] = param[1];
    });
    return paramterArray;
}

function present_sign_in(){
    const oauth_state = get_random();
    chrome.storage.local.set({'oauth_state':oauth_state});
    chrome.identity.launchWebAuthFlow({
        "url": "https://accounts.spotify.com/authorize" +
                "?client_id=REDACTED" +
                "&response_type=token" +
                "&redirect_uri="+"https://kmcjjamgboeeojogajkddkfolepciomh.chromiumapp.org/callback" +
                "&state="+oauth_state +
                "&scope=user-modify-playback-state",
        "interactive": true
    }, oauth_callback);
    return true;
}

function oauth_callback(responseUrl){
    if(chrome.runtime.lastError && responseUrl===undefined){
        return fail_sign_in(chrome.runtime.lastError.message);
    }
    get_token(responseUrl);
}

function fail_sign_in(reason){
    console.error("Failed to sign in: "+reason);
    chrome.storage.local.remove('oauth_state');
    chrome.storage.local.remove('access_token');
    chrome.storage.local.set({'attempts':999});
}

function get_token(responseUrl){
    const params = get_url_params(responseUrl);
    const access_token = params.access_token;
    const actual_state = params.state;
    chrome.storage.local.get(["oauth_state"], items => {
        if(items.oauth_state!==actual_state){
            return fail_sign_in("OAuth code flow state mismatch: "+items.oauth_state+","+actual_state);
        } else {
            console.info("Got token, valid for ", params.expires_in, "s");
            chrome.storage.local.remove('oauth_state');
            chrome.storage.local.set({
                'access_token':access_token,
            }, () => {doPlayToggle(access_token);});
        }
    });
}

function doPlayToggle(access_token){
    chrome.browserAction.getBadgeText({}, result => {
        let next;
        let request;
        const init = {
            method: "PUT",
            headers: new Headers({'Authorization': "Bearer "+access_token})
        };
        if(result==="⏸"){
            request = new Request("https://api.spotify.com/v1/me/player/pause",init);
            next = "▶";
        } else {
            request = new Request("https://api.spotify.com/v1/me/player/play",init);
            next = "⏸";
        }
        fetch(request).then(response => {
            if(response.status===204){
                chrome.browserAction.setBadgeText({text: next}, () => {
                    chrome.storage.local.set({attempts:0});
                });
            } else {
                chrome.storage.local.get(["attempts"], items => {
                    console.warn(response);
                    if(items.attempts > 3){
                        const now = new Date().getTime();
                        if(now > items.attempts){
                            chrome.storage.local.set({attempts:0}, present_sign_in);
                        } else {
                            console.warn("Not attempting for a short while, until "+items.attempts);
                        }
                    } else if(items.attempts > 2){
                        console.log("failed too many times. Giving up");
                        chrome.storage.local.set({attempts:new Date().getTime() + 3600});
                    } else {
                        chrome.browserAction.setBadgeText({text: next}, () => {
                            chrome.storage.local.set({attempts:items.attempts===undefined ? 0 : items.attempts + 1}, present_sign_in);
                        });
                    }
                });
            }
        });
    });
}

function userRequestedPlaybackToggle(){
    chrome.storage.local.get(["access_token"], items => {
        if(!items.access_token){
            present_sign_in();
        } else {
            doPlayToggle(items.access_token);
        }
    });
}

chrome.browserAction.onClicked.addListener(userRequestedPlaybackToggle);
chrome.commands.onCommand.addListener(userRequestedPlaybackToggle);
