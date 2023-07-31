function rename(nodes){
    let names = nodes.names;
    names = $.replace(names, /TR/, 阿根廷);
    names = $.trim(names);
    return names;
}
