var ResizingConstraint = {
    NONE: 0,
    RIGHT: 1 << 0,
    WIDTH: 1 << 1,
    LEFT: 1 << 2,
    BOTTOM: 1 << 3,
    HEIGHT: 1 << 4,
    TOP: 1 << 5
}


const sketch = require('sketch')

var onDocumentChanged = function (context) {
    const document = require('sketch').getSelectedDocument()

    var changes = context.actionContext
    for (var i = 0; i < changes.length; i++) {
        var change = changes[i];
        var path = change.fullPath();
        var type = change.type();
        let parent = null

        switch (type) {
            case 1: // Property chang
                log(`Property changed at ${path}`);
                //                
                const i = path.indexOf("].overrideValues")
                if (i >= 0)
                    parent = getChangeParent(document, change)
                else
                    parent = sketch.fromNative(change.object()).parent
                //
                handleGroupChanges(parent)
                break;
            case 2: // Deletion
                // Objects that got moved in the tree are both deleted from the tree
                // and re-added.
                if (change.isMove()) break;

                log(`Object deleted at ${path}`);
                parent = getChangeParent(document, change)
                log("parent: " + parent.name)
                handleGroupChanges(parent)
                break;
            case 3: // Addition                
                if (change.isMove()) {
                    log(`Object moved from ${change.associatedChange().fullPath()} to ${path}`)

                    const oldParent = getChangeParent(document, change.associatedChange())
                    handleGroupChanges(oldParent)

                    const newParent = sketch.fromNative(change.object()).parent
                    handleGroupChanges(newParent)
                } else {
                    log(`New object inserted at ${path}`);
                    const newParent = sketch.fromNative(change.object()).parent
                    handleGroupChanges(newParent)
                }
                break;
            default:
                log(`⚠️ Unexpected change type ${type}`);
        }
    }
};


function getChangeParent(document, change) {
    let path = change.fullPath().toString()
    const i = path.indexOf("].overrideValues")
    log(i)
    if (i >= 0) {
        path = path.substring(0, i + 1)
    }
    log(path)
    return eval(`document.${path.match(/(.*)\./)[1]}`)
}

function handleGroupChanges(parent) {
    //adjustLayers(parent.layers, true)
    adjustLayers(parent.layers, false)


}

function adjustLayers(layers, isX) {
    log("ADJUST LAYERS")
    if (isX)
        layers = layers.slice().sort((a, b) => a.frame.x - b.frame.x)
    else
        layers = layers.slice().sort((a, b) => a.frame.y - b.frame.y)

    const spacerName = "@" + (isX ? "X" : "Y") + "Spacer@"
    const perpSpacerName = "@" + (isX ? "Y" : "X") + "Spacer@"


    let pos = null
    let oldPos = null
    let prevObj = null

    //log(layers.slice(index + 1))
    let backLayer = null
    layers.forEach(function (l) {
        const isPerpSpacer = isSpacer(l, perpSpacerName)
        if (isPerpSpacer) return

        // Skip cards and other full size layers
        if (18 == l.sketchObject.resizingConstraint()) {
            backLayer = l
            return
        }

        if (null == pos) pos = isX ? l.frame.x : l.frame.y
        const currPos = isX ? l.frame.x : l.frame.y

        // if the prev object was on the same position and it was spacer
        const prevWasSpace = false && oldPos != null && currPos == oldPos && !isSpacer(l, spacerName) && isSpacer(prevObj, spacerName)
        if (prevWasSpace) {
            // move cursor back
            pos = oldPos
            if (isX)
                prevObj.frame.x += l.frame.width
            else
                prevObj.frame.y += l.frame.height
        }
        //                        
        const delta = pos - currPos
        if (isX)
            l.frame.x += delta
        else
            l.frame.y += delta
        oldPos = pos

        pos += isX ? l.frame.width : l.frame.height
        if (prevWasSpace) pos += isX ? prevObj.frame.width : prevObj.frame.height

        prevObj = l
        log(l.name)
        log(pos)
    }, this)

    // Check if we need to resize back layer    
    if ("Artboard" != prevObj.parent.type) {
        // need to increase height of back layer
        const newDelta = pos - prevObj.parent.frame.height
        if (newDelta != 0) resizeParent(prevObj.parent, newDelta, isX)
    }
}


function resizeParent(parent, delta, isX) {
    log("resize parent to " + parent.frame.height + " type=" + parent.type)
    if (isX)
        parent.frame.width += delta
    else
        parent.frame.height += delta
    //
    if ("Artboard" != parent.type) return adjustLayers(parent.parent.layers, isX)
}

function isSpacer(l, spacerName) {
    return l.name.includes(spacerName)
        || ("SymbolInstance" == l.type && l.master && l.master.layers[0] && l.master.layers[0].name.includes(spacerName))
}


function adjustLayers2(layers, isX) {
    log("ADJUST LAYERS")
    if (isX)
        layers = layers.slice().sort((a, b) => a.frame.x + a.frame.width - (b.frame.x + b.frame.width))
    else
        layers = layers.slice().sort((a, b) => a.frame.y + a.frame.height - (b.frame.y + b.frame.height))

    const spacerName = "@" + (isX ? "X" : "Y") + "Spacer@"
    const perpSpacerName = "@" + (isX ? "Y" : "X") + "Spacer@"

    layers.forEach(function (child, index) {
        log("child name: " + child.name)
        const isSpacer = child.name.includes(spacerName)
            || ("SymbolInstance" == child.type && child.master && child.master.layers[0] && child.master.layers[0].name.includes(spacerName))

        if (!isSpacer) return

        let pos = isX ? child.frame.x + child.frame.width : child.frame.y + child.frame.height
        let oldPos = null

        //log(layers.slice(index + 1))
        let backLayer = null
        layers.slice(index + 1).forEach(function (l) {
            const isPerpSpacer = l.name.includes(perpSpacerName)
                || ("SymbolInstance" == l.type && l.master && l.master.layers[0] && l.master.layers[0].name.includes(perpSpacerName))
            if (isPerpSpacer) return

            // Skip cards and other full size layers
            if (18 == l.sketchObject.resizingConstraint()) {
                backLayer = l
                return
            }
            //log("name: " + l.name)
            //log(l.sketchObject.resizingConstraint())
            /*const c = getLayerConstrains(l)
            if (isX) {
                if (c.right) return
            } else {
                if (c.bottom) return
            }*/
            // if the next object on the same position
            const lPos = isX ? l.frame.x : l.frame.y
            if (oldPos != null && lPos == oldPos) {
                pos = oldPos
            }
            //                        
            const delta = pos - lPos
            if (isX)
                l.frame.x += delta
            else
                l.frame.y += delta
            oldPos = pos
            pos += isX ? l.frame.width : l.frame.height
        }, this)

        // Check if we need to resize back layer
        if (backLayer) {
            // need to increase height of back layer
            if ((backLayer.frame.y + backLayer.frame.height - 1) != pos) {
                backLayer.parent.frame.height = pos - backLayer.frame.y
            }
        }

    }, this)
}

function getLayerConstrains(layer) {
    const resizingConstraint = 63 ^ layer.sketchObject.resizingConstraint()
    const res = {
        top: (resizingConstraint & ResizingConstraint.TOP) === ResizingConstraint.TOP,
        bottom: (resizingConstraint & ResizingConstraint.BOTTOM) === ResizingConstraint.BOTTOM,
        left: (resizingConstraint & ResizingConstraint.LEFT) === ResizingConstraint.LEFT,
        right: (resizingConstraint & ResizingConstraint.RIGHT) === ResizingConstraint.RIGHT,
        height: (resizingConstraint & ResizingConstraint.HEIGHT) === ResizingConstraint.HEIGHT,
        width: (resizingConstraint & ResizingConstraint.WIDTH) === ResizingConstraint.WIDTH
    }
    return res
}