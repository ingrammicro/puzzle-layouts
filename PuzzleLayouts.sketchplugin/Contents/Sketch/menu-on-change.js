const NAME_VERTICAL_STACK = "@vs"

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
let running = false

var onDocumentChanged = function (context) {
    if (running) return

    const document = require('sketch').getSelectedDocument()
    running = true
    log("RUNNING")

    // take the only last change (TODO: RESOLVE IT!!!)
    var changes = context.actionContext.slice(-1) //.sort((a, b) => { a.fullPath().length > b.fullPath().length ? -1 : 1 })


    for (var i = 0; i < changes.length; i++) {
        var change = changes[i];
        var path = change.fullPath();
        var type = change.type();
        let parent = null
        let obj = null

        switch (type) {
            case 1: // Property chang
                log(`Property changed at ${path}`);
                //                
                const i = path.indexOf("].overrideValues")
                if (i >= 0)
                    parent = getChangeParent(document, change)
                else {
                    obj = sketch.fromNative(change.object())
                    parent = "Artboard" != obj.type && "Group" != obj.type ? obj.parent : obj
                    log("change obj: " + obj.name)
                }
                //
                handleGroupChanges(parent, null, obj)
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
                break
        }
        //break
    }

    running = false
    log("DONE")
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

function handleGroupChanges(parent, isX = null, obj) {
    //adjustLayers(parent.layers, true)
    log("handleGroupChanges: " + parent.name)
    if ((null == isX || !isX) && parent.name.includes(NAME_VERTICAL_STACK)) adjustLayers(parent.layers, false, obj)
}

function adjustLayers(layers, isX, changedObj) {
    log("ADJUST LAYERS")
    if (isX)
        layers = layers.slice().sort((a, b) => a.frame.x - b.frame.x)
    else
        layers = layers.slice().sort((a, b) => a.frame.y - b.frame.y)

    const spacerName = "@" + (isX ? "X" : "Y") + "Spacer@"
    const perpSpacerName = "@" + (isX ? "Y" : "X") + "Spacer@"

    const parent = layers[0].parent

    let nextPos = null
    let prevPos = null
    let prevSize = null
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

        const currPos = isX ? l.frame.x : l.frame.y
        const currSize = isX ? l.frame.width : l.frame.height
        if (null == nextPos) nextPos = currPos

        // if the prev object was space
        const prevWasSpace = prevObj != null && !isSpacer(l, spacerName) && isSpacer(prevObj, spacerName)
            // check if the current obj position inside a previous spacer
            && prevPos < currPos && (prevPos + prevSize - 1) >= currPos

        log(prevPos + prevSize - 1)
        if (prevWasSpace) {
            // move cursor back
            log("MOVED prev spacer down")
            nextPos -= prevSize
            if (isX)
                prevObj.frame.x += currSize
            else
                prevObj.frame.y += currSize
        }
        //                                
        if (isX)
            l.frame.x = nextPos
        else
            l.frame.y = nextPos

        nextPos += currSize
        if (prevWasSpace) nextPos += prevSize

        prevPos = currPos
        prevSize = currSize

        prevObj = l
        log(l.name + " currPos=" + currPos + " size=" + currSize + " nextPos=" + nextPos)
    }, this)

    // Check if we need to resize back layer    
    if ("Artboard" != parent.type) {
        // need to adjust parent size
        resizeParent(parent, nextPos, isX)
    }
}


function resizeParent(parent, newSize, isX) {
    log("RESIZE PARENT " + parent.name + " from " + parent.frame.height + " to=" + newSize)
    if (isX)
        parent.frame.width = newSize
    else
        parent.frame.height = newSize
    //
    if ("Artboard" != parent.type) return handleGroupChanges(parent.parent, isX)
}

function isSpacer(l, spacerName) {
    return l.name.includes(spacerName)
        || ("SymbolInstance" == l.type && l.master && l.master.layers[0] && l.master.layers[0].name.includes(spacerName))
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