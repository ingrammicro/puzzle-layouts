const NAME_VERTICAL_STACK = "@vs"
const NAME_HORIZONTAL_STACK = "@hs"
const HORIZ = true
const VERT = false

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

function handleGroupChanges(parent) {
    //adjustLayers(parent.layers, true)
    log("handleGroupChanges: " + parent.name)
    if (parent.name.includes(NAME_VERTICAL_STACK))
        adjustLayers(parent.layers, VERT)
    else if (parent.name.includes(NAME_HORIZONTAL_STACK))
        adjustLayers(parent.layers, HORIZ)
}

function sortVert(a, b) {
    return a.frame.y - b.frame.y
}

function sortHoriz(a, b) {
    return a.frame.x - b.frame.x
}

function adjustLayers(layers, dir) {
    log("ADJUST LAYERS")
    layers = layers.slice().sort(VERT == dir ? sortVert : sortHoriz)

    const spacerName = VERT == dir ? "@YSpacer@" : "@XSpacer@"
    const perpSpacerName = VERT == dir ? "@XSpacer@" : "@YSpacer@"

    const parent = layers[0].parent

    let nextPos = null
    let prevPos = null
    let prevSize = null
    let prevObj = null

    let perpSpacers = []
    let spacers = []

    //log(layers.slice(index + 1))
    layers.forEach(function (l) {
        const isPerpSpacer = isSpacer(l, perpSpacerName)
        if (isPerpSpacer) {
            perpSpacers.push(l)
            return
        }
        if (isSpacer(l, spacerName)) {
            spacers.push(l)
        }

        const currPos = VERT == dir ? l.frame.y : l.frame.x
        const currSize = VERT == dir ? l.frame.height : l.frame.width
        if (null == nextPos) nextPos = currPos

        // if the prev object was space
        const prevWasSpace = prevObj != null && !isSpacer(l, spacerName) && isSpacer(prevObj, spacerName)
            // check if the current obj position inside a previous spacer
            && prevPos < currPos && (prevPos + prevSize - 1) >= currPos

        if (prevWasSpace) {
            // move cursor back
            log("MOVED prev spacer down")
            nextPos -= prevSize
            if (VERT == dir) prevObj.frame.y += currSize; else prevObj.frame.x += currSize;
        }
        //                                
        if (nextPos != currPos) {
            log("Resized " + l.name)
            if (VERT == dir) l.frame.y = nextPos; else l.frame.x = nextPos
        }

        nextPos += currSize
        if (prevWasSpace) nextPos += prevSize

        prevPos = currPos
        prevSize = currSize

        prevObj = l
        log(l.name + " currPos=" + currPos + " size=" + currSize + " nextPos=" + nextPos)
    }, this)


    // Resize perp spacers to full group size
    perpSpacers.forEach(function (l) {
        if (VERT == dir) l.frame.height = nextPos - l.frame.y; else l.frame.width = nextPos - l.frame.x;
    }, this)

    // Resize perp spacers to full group size
    spacers.forEach(function (l) {
        if (VERT == dir) l.frame.width = parent.frame.width; else l.frame.height = parent.frame.height
    }, this)

    // Check if we need to resize back layer    
    if ("Artboard" != parent.type) {
        // need to adjust parent size
        resizeParent(parent, nextPos, dir)
    }
}


function resizeParent(parent, newSize, dir) {
    //if (parent.name == "overview @vs") return
    if (VERT == dir) parent.frame.height = newSize; else parent.frame.width = newSize
    //
    if ("Artboard" != parent.type) {
        return handleGroupChanges(parent.parent)
    }
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